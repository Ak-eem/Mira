"use server";

import { revalidatePath } from "next/cache";
import { getCurrentBusinessOwner } from "@/lib/supabase/portal-auth";
import { createClient } from "@/lib/supabase/server";
import { sendOrderStatusEmailIfConsented } from "@/lib/notifications/sendOrderStatusEmail";

type OrderStatus = "cart" | "placed" | "shipped" | "delivered" | "cancelled";

async function assertOwnsBusiness(businessId: string): Promise<boolean> {
  const owner = await getCurrentBusinessOwner();
  return !!owner && owner.businesses.some((b) => b.id === businessId);
}

// Recent conversations for this business, for the "pick a customer"
// dropdown on the order form. Returns session_token verbatim as
// `identifier` -- picking one of these and passing it back as
// selectedConversationIdentifier is what lets a web-chat order (no phone
// number at all) get created correctly, see createOrder below.
export async function listRecentConversations(
  businessId: string,
): Promise<{ identifier: string; label: string }[]> {
  if (!(await assertOwnsBusiness(businessId))) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("conversations")
    .select("session_token, channel, last_message_at")
    .eq("business_id", businessId)
    .order("last_message_at", { ascending: false })
    .limit(30);

  return (data ?? []).map((c) => ({
    identifier: c.session_token,
    label:
      c.channel === "whatsapp"
        ? c.session_token.replace(/^wa_/, "")
        : `Web visitor ${c.session_token.replace(/^web_/, "").slice(0, 8)}`,
  }));
}

export async function createOrder(input: {
  businessId: string;
  customerIdentifier: string;
  // Exact conversations.session_token from listRecentConversations above.
  // When present, this is used as-is instead of the phone-number
  // coercion below -- it's the fix for web-chat customers never being
  // linkable to an order (see 0015_orders.sql / OrdersPanel history):
  // freehand entry here used to get force-prefixed with wa_ no matter
  // what was typed, so a web_<visitorId> customer could never be
  // represented at all.
  selectedConversationIdentifier?: string;
  status: OrderStatus;
  items: { name: string; quantity: string; unitPrice: string }[];
}): Promise<{ error: string | null }> {
  if (!(await assertOwnsBusiness(input.businessId))) return { error: "Not authorized for this business." };

  let normalizedIdentifier: string;
  const pickedIdentifier = input.selectedConversationIdentifier?.trim();
  if (pickedIdentifier) {
    normalizedIdentifier = pickedIdentifier;
  } else {
    const customerIdentifier = input.customerIdentifier.trim();
    if (!customerIdentifier) return { error: "Pick a recent chat, or enter a customer phone number." };
    // Nudges only ever sends via WhatsApp -- normalize freehand phone
    // entry to the same wa_<phone> shape conversations and nudge_sends
    // already use, so this order can actually be found by the cron
    // later. Only applies to this manual-phone-number fallback path --
    // a picked conversation identifier above is never touched here.
    normalizedIdentifier = customerIdentifier.startsWith("wa_")
      ? customerIdentifier
      : `wa_${customerIdentifier.replace(/[^0-9]/g, "")}`;
  }

  const validItems = input.items
    .map((item) => ({
      name: item.name.trim(),
      quantity: Number(item.quantity) || 1,
      unit_price: item.unitPrice.trim() ? Number(item.unitPrice) : null,
    }))
    .filter((item) => item.name);

  if (validItems.length === 0) return { error: "At least one item with a name is required." };

  const total = validItems.reduce((sum, item) => sum + (item.unit_price ?? 0) * item.quantity, 0);

  const supabase = await createClient();
  const { data: order, error } = await supabase
    .from("orders")
    .insert({
      business_id: input.businessId,
      customer_identifier: normalizedIdentifier,
      status: input.status,
      total,
    })
    .select("id")
    .single();

  if (error || !order) return { error: error?.message ?? "Failed to create order." };

  const { error: itemsError } = await supabase
    .from("order_items")
    .insert(validItems.map((item) => ({ ...item, order_id: order.id })));
  if (itemsError) return { error: itemsError.message };

  revalidatePath(`/portal/${input.businessId}/orders`);
  return { error: null };
}

const EMAILABLE_STATUSES = new Set<OrderStatus>(["placed", "shipped", "delivered", "cancelled"]);

export async function updateOrderStatus(businessId: string, orderId: string, status: OrderStatus): Promise<void> {
  if (!(await assertOwnsBusiness(businessId))) {
    console.error("updateOrderStatus called without owning this business");
    return;
  }

  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from("orders")
    .update({ status, status_changed_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("business_id", businessId)
    .select("customer_identifier, total, order_items(name, quantity)")
    .maybeSingle();

  if (error) console.error("Failed to update order status:", error);

  revalidatePath(`/portal/${businessId}/orders`);

  // Best-effort notification, fired after the status update above has
  // already succeeded (or failed) -- a Resend outage or a missing
  // consent row should never be able to undo or block the status change
  // itself. 'cart' is excluded: it's an in-progress state the customer
  // never asked to hear about.
  if (updated && EMAILABLE_STATUSES.has(status)) {
    const { data: business } = await supabase
      .from("businesses")
      .select("name, currency")
      .eq("id", businessId)
      .maybeSingle();

    if (business) {
      await sendOrderStatusEmailIfConsented(supabase, {
        businessId,
        businessName: business.name,
        currency: business.currency,
        customerIdentifier: updated.customer_identifier,
        status: status as "placed" | "shipped" | "delivered" | "cancelled",
        items: (updated.order_items ?? []).map((item: { name: string; quantity: number }) => ({
          name: item.name,
          quantity: item.quantity,
        })),
        total: updated.total,
      });
    }
  }
}
