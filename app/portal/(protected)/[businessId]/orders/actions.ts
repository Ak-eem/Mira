"use server";

import { revalidatePath } from "next/cache";
import { getCurrentBusinessOwner } from "@/lib/supabase/portal-auth";
import { createClient } from "@/lib/supabase/server";

type OrderStatus = "cart" | "placed" | "shipped" | "delivered" | "cancelled";

async function assertOwnsBusiness(businessId: string): Promise<boolean> {
  const owner = await getCurrentBusinessOwner();
  return !!owner && owner.businesses.some((b) => b.id === businessId);
}

export async function createOrder(input: {
  businessId: string;
  customerIdentifier: string;
  status: OrderStatus;
  items: { name: string; quantity: string; unitPrice: string }[];
}): Promise<{ error: string | null }> {
  if (!(await assertOwnsBusiness(input.businessId))) return { error: "Not authorized for this business." };

  const customerIdentifier = input.customerIdentifier.trim();
  if (!customerIdentifier) return { error: "Customer (phone number) is required." };
  // Nudges only ever sends via WhatsApp -- normalize to the same wa_<phone>
  // shape conversations and nudge_sends already use, so this order can
  // actually be found by the cron later.
  const normalizedIdentifier = customerIdentifier.startsWith("wa_") ? customerIdentifier : `wa_${customerIdentifier.replace(/[^0-9]/g, "")}`;

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

export async function updateOrderStatus(businessId: string, orderId: string, status: OrderStatus): Promise<void> {
  if (!(await assertOwnsBusiness(businessId))) {
    console.error("updateOrderStatus called without owning this business");
    return;
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("orders")
    .update({ status, status_changed_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("business_id", businessId);

  if (error) console.error("Failed to update order status:", error);

  revalidatePath(`/portal/${businessId}/orders`);
}
