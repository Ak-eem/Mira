import type { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { OrderRequest } from "@/lib/ai/generateReply";
import { resolveOrderItems, type CatalogProduct } from "@/lib/orders/resolveItems";
import {
  getDeliveryThanksReply,
  getOrderPlacedReply,
  getOrderProblemReply,
  getOrderRecapReply,
} from "@/lib/orders/orderReplies";
import { CUSTOMER_DELIVERABLE_STATUSES } from "@/lib/orders/status";
import { transitionOrderStatus } from "@/lib/orders/transition";

type Client = ReturnType<typeof createServiceRoleClient>;

// processMessage owns recordAssistantReply; it's passed in (rather than
// imported) so this module and processMessage can't form an import cycle.
export type RecordReply = (args: {
  content: string;
  snapshot: Record<string, unknown>;
  flagHandoff?: boolean;
}) => Promise<{ messageId: string } | null>;

export type OrderTakingContext = {
  businessId: string;
  businessName: string;
  currency: string;
  conversationId: string;
  sessionToken: string;
  channel: "web" | "whatsapp" | "email";
  inboundKey: string | null;
  // Key of the assistant reply row (replyKeyFor(inboundKey)), null on web.
  replyKey: string | null;
};

type RecapSnapshot = {
  orderRecap?: boolean;
  items?: { product_id: string; quantity: number }[];
  note?: string | null;
};

export type HandledReply = { reply: string; messageId: string };

/**
 * Turns the model's "customer wants these items" signal into a real order,
 * with the server -- not the model -- holding every commitment:
 *
 *  - First signal (or any change of mind): resolve names against the catalogue
 *    and reply with a deterministic recap. Nothing is created.
 *  - Customer says yes AND our previous reply was that recap: create the order
 *    from the RECAP's stored items, not from whatever the model sent this
 *    turn, atomically flagging the conversation for staff on the shared
 *    needs_human queue (handoff_reason = 'order').
 *
 * So an order can only exist if a customer saw an exact summary and agreed.
 */
export async function processOrderRequest(
  supabase: Client,
  ctx: OrderTakingContext,
  request: OrderRequest,
  record: RecordReply,
): Promise<HandledReply> {
  const { data: lastAssistant, error: lastError } = await supabase
    .from("messages")
    .select("context_snapshot")
    .eq("conversation_id", ctx.conversationId)
    .eq("role", "assistant")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastError) throw lastError;

  const snapshot = (lastAssistant?.context_snapshot ?? null) as RecapSnapshot | null;
  const recap = snapshot?.orderRecap === true && Array.isArray(snapshot.items) && snapshot.items.length > 0 ? snapshot : null;

  if (request.customerConfirmed && recap) {
    const replyText = getOrderPlacedReply(ctx.businessName);
    const { data, error } = await supabase.rpc("place_order_atomic", {
      p_business_id: ctx.businessId,
      p_conversation_id: ctx.conversationId,
      p_customer_identifier: ctx.sessionToken,
      p_items: recap.items,
      p_note: recap.note ?? request.note ?? null,
      p_inbound_key: ctx.inboundKey,
      p_reply_content: replyText,
      p_reply_snapshot: { handoff: true, reason: "order" },
      p_reply_inbound_key: ctx.replyKey,
    });

    if (error) {
      // Stock or availability changed between the recap and the yes: nothing
      // was created (the function aborts as one transaction). Say so plainly
      // and ask again instead of failing the message.
      console.error("place_order_atomic failed:", error);
      const problem = "Sorry, something in that order just became unavailable, so I haven't sent it. Could you tell me what you'd like again?";
      const saved = await record({ content: problem, snapshot: { orderFailed: true } });
      if (!saved) throw error;
      return { reply: problem, messageId: saved.messageId };
    }

    const row = (Array.isArray(data) ? data[0] : data) as { order_id?: string; message_id?: string } | null;
    if (!row?.order_id || !row.message_id) throw new Error("place_order_atomic returned no row");

    // An email-channel customer has already given us their address by writing
    // to us; record it as delivery-update consent so the existing email path
    // (and its unsubscribe link) works for them. ignoreDuplicates keeps a
    // prior opt-out from being silently reversed.
    if (ctx.channel === "email" && ctx.sessionToken.startsWith("email_")) {
      const email = ctx.sessionToken.slice("email_".length);
      const { error: prefError } = await supabase.from("customer_notification_preferences").upsert(
        { business_id: ctx.businessId, customer_identifier: ctx.sessionToken, email, consented_at: new Date().toISOString() },
        { onConflict: "business_id,customer_identifier", ignoreDuplicates: true },
      );
      if (prefError) console.error("email consent upsert failed:", prefError);
    }

    return { reply: replyText, messageId: row.message_id };
  }

  const { data: catalog, error: catalogError } = await supabase
    .from("products")
    .select("id, name, price, is_available, stock_quantity")
    .eq("business_id", ctx.businessId)
    .limit(200);
  if (catalogError) throw catalogError;

  const resolved = resolveOrderItems(request.items, (catalog ?? []) as CatalogProduct[]);

  if (!resolved.ok) {
    const content = getOrderProblemReply(resolved);
    const saved = await record({ content, snapshot: { orderProblem: resolved.reason } });
    if (!saved) throw new Error("Could not record order clarification reply.");
    return { reply: content, messageId: saved.messageId };
  }

  const content = getOrderRecapReply(resolved.items, resolved.total, ctx.currency, ctx.businessName);
  const saved = await record({
    content,
    snapshot: {
      orderRecap: true,
      items: resolved.items.map((item) => ({ product_id: item.product_id, quantity: item.quantity })),
      note: request.note,
    },
  });
  if (!saved) throw new Error("Could not record order recap reply.");
  return { reply: content, messageId: saved.messageId };
}

/**
 * A customer on a button-less channel saying "delivered" / "received".
 * Returns null (fall through to the normal AI pipeline) unless this customer
 * really has a confirmed or shipped order to close out.
 */
export async function processDeliveryConfirmation(
  supabase: Client,
  ctx: Pick<OrderTakingContext, "businessId" | "sessionToken">,
  record: RecordReply,
): Promise<HandledReply | null> {
  const { data: order, error } = await supabase
    .from("orders")
    .select("id")
    .eq("business_id", ctx.businessId)
    .eq("customer_identifier", ctx.sessionToken)
    .in("status", [...CUSTOMER_DELIVERABLE_STATUSES])
    .order("status_changed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !order) return null;

  const result = await transitionOrderStatus(supabase, {
    businessId: ctx.businessId,
    orderId: order.id,
    to: "delivered",
    actor: "customer",
    expectedCustomerIdentifier: ctx.sessionToken,
    threadNotice: false,
  });
  if (!result.ok) return null;

  const content = getDeliveryThanksReply();
  const saved = await record({ content, snapshot: { orderDelivered: true } });
  return saved ? { reply: content, messageId: saved.messageId } : null;
}
