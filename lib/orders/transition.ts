import type { SupabaseClient } from "@supabase/supabase-js";
import { closeConversation } from "@/lib/chat/closeConversation";
import { notifyOrderStatus } from "@/lib/notifications/notifyOrderStatus";
import {
  CUSTOMER_DELIVERABLE_STATUSES,
  OPEN_ORDER_STATUSES,
  isNotifiableStatus,
  type OrderStatus,
} from "@/lib/orders/status";

export type TransitionActor = "staff" | "customer";

export type TransitionResult = { ok: true; changed: boolean } | { ok: false; error: string };

type OrderRow = {
  id: string;
  status: OrderStatus;
  customer_identifier: string;
  conversation_id: string | null;
  total: number | null;
  order_items: { name: string; quantity: number }[] | null;
};

const THREAD_NOTICE: Partial<Record<OrderStatus, (business: string) => string>> = {
  confirmed: (business) => `Good news — ${business} has confirmed your order.`,
  shipped: () => "Your order is on its way.",
  delivered: () => "Your order was marked as delivered. Thanks for shopping with us!",
  cancelled: () => "Your order was cancelled. Message us here if that's unexpected.",
};

/**
 * The single place an order changes status. Both the portal (staff, RLS-bound
 * client) and the customer's "mark delivered" (service-role client) call this,
 * so the side effects can never drift apart:
 *
 *  1. guarded status update (only if the status is still what we read)
 *  2. a visible notice in the customer's chat thread -- this is how web-chat
 *     customers "check back in the same thread"
 *  3. confirmed/cancelled resolves the order handoff on the SAME needs_human
 *     queue support escalations use, once no other order awaits confirmation
 *  4. customer ping (WhatsApp direct, email if consented)
 *  5. delivered closes the conversation via the shared closeConversation
 *
 * Effects 2-5 are best-effort: the status change already happened and must
 * never be undone by a Resend or Meta outage.
 */
export async function transitionOrderStatus(
  supabase: SupabaseClient,
  args: {
    businessId: string;
    orderId: string;
    to: OrderStatus;
    actor: TransitionActor;
    // The customer route pins the order to the caller's own identity.
    expectedCustomerIdentifier?: string;
    // The text-phrase path replies itself, so it skips the in-thread notice.
    threadNotice?: boolean;
  },
): Promise<TransitionResult> {
  const { businessId, orderId, to, actor } = args;

  const { data: order, error: loadError } = await supabase
    .from("orders")
    .select("id, status, customer_identifier, conversation_id, total, order_items(name, quantity)")
    .eq("id", orderId)
    .eq("business_id", businessId)
    .maybeSingle<OrderRow>();

  if (loadError) {
    console.error("transitionOrderStatus: load failed", loadError);
    return { ok: false, error: "Could not load that order." };
  }
  if (!order || (args.expectedCustomerIdentifier && order.customer_identifier !== args.expectedCustomerIdentifier)) {
    return { ok: false, error: "Order not found." };
  }
  if (order.status === to) return { ok: true, changed: false };

  if (actor === "customer" && (to !== "delivered" || !CUSTOMER_DELIVERABLE_STATUSES.includes(order.status))) {
    return { ok: false, error: "This order can't be marked delivered yet." };
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status: to, status_changed_at: now };
  if (to === "confirmed") patch.confirmed_at = now;
  if (to === "delivered") patch.delivered_by = actor === "customer" ? "customer" : "staff";

  const { data: updated, error: updateError } = await supabase
    .from("orders")
    .update(patch)
    .eq("id", orderId)
    .eq("business_id", businessId)
    .eq("status", order.status) // lost a race with another actor -> no row
    .select("id")
    .maybeSingle();

  if (updateError) {
    console.error("transitionOrderStatus: update failed", updateError);
    return { ok: false, error: "Could not update that order." };
  }
  if (!updated) return { ok: false, error: "This order was just updated by someone else. Refresh and try again." };

  try {
    const { data: business } = await supabase
      .from("businesses")
      .select("name, currency")
      .eq("id", businessId)
      .maybeSingle();
    const businessName = business?.name ?? "the business";

    // The order's own conversation, or (manual orders never store one) the
    // customer's currently open conversation with this business.
    let conversation: { id: string; status: string; needs_human: boolean; handoff_reason: string | null } | null = null;
    const conversationQuery = supabase
      .from("conversations")
      .select("id, status, needs_human, handoff_reason")
      .eq("business_id", businessId);
    const { data: found } = order.conversation_id
      ? await conversationQuery.eq("id", order.conversation_id).maybeSingle()
      : await conversationQuery.eq("session_token", order.customer_identifier).eq("status", "open").maybeSingle();
    conversation = found ?? null;

    // 2. in-thread notice
    const noticeText = THREAD_NOTICE[to]?.(businessName);
    if (conversation && noticeText && args.threadNotice !== false) {
      const { error: noticeError } = await supabase.from("messages").insert({
        conversation_id: conversation.id,
        business_id: businessId,
        role: "assistant",
        content: noticeText,
        context_snapshot: { systemNotice: true, orderUpdate: to, orderId },
      });
      if (noticeError) console.error("transitionOrderStatus: thread notice failed", noticeError);
    }

    // 3. resolve the order handoff on the shared queue
    if (
      conversation &&
      (to === "confirmed" || to === "cancelled") &&
      conversation.needs_human &&
      conversation.handoff_reason === "order"
    ) {
      const { count } = await supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("business_id", businessId)
        .eq("conversation_id", conversation.id)
        .eq("status", "placed");
      if ((count ?? 0) === 0) {
        const { error: releaseError } = await supabase
          .from("conversations")
          .update({ needs_human: false, handoff_reason: null })
          .eq("id", conversation.id)
          .eq("business_id", businessId);
        if (releaseError) console.error("transitionOrderStatus: handoff release failed", releaseError);
      }
    }

    // 4. customer ping (skipped when the customer is the one who just said it)
    if (isNotifiableStatus(to) && !(actor === "customer" && to === "delivered")) {
      await notifyOrderStatus(supabase, {
        businessId,
        businessName,
        currency: business?.currency ?? "NGN",
        customerIdentifier: order.customer_identifier,
        status: to,
        items: (order.order_items ?? []).map((item) => ({ name: item.name, quantity: item.quantity })),
        total: order.total,
      });
    }

    // 5. delivered closes the conversation -- unless this customer still has
    //    another order in flight, in which case the thread stays useful.
    if (to === "delivered" && conversation?.status === "open") {
      const { count: stillOpen } = await supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("business_id", businessId)
        .eq("customer_identifier", order.customer_identifier)
        .in("status", [...OPEN_ORDER_STATUSES]);
      if ((stillOpen ?? 0) === 0) {
        await closeConversation(supabase, {
          conversationId: conversation.id,
          businessId,
          endedBy: actor === "customer" ? "customer" : "operator",
        });
      }
    }
  } catch (effectError) {
    console.error("transitionOrderStatus: side effects failed", effectError);
  }

  return { ok: true, changed: true };
}
