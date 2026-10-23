"use server";

import { revalidatePath } from "next/cache";
import { getCurrentBusinessOwner } from "@/lib/supabase/portal-auth";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { saveConnection, disconnect, linkShipmentToOrder } from "@/lib/logistics/connections";

// The service-role client is used here ONLY after the caller has been
// checked against their own business memberships below, and every query
// inside lib/logistics/connections.ts is scoped by the business_id that
// was just authorised. (Owners have RLS access to their connection row,
// but order_shipments has no owner INSERT policy by design -- shipments
// are written by this action and by the courier webhook, never directly
// from a browser session.)
async function membershipRole(businessId: string): Promise<"owner" | "staff" | null> {
  const owner = await getCurrentBusinessOwner();
  const membership = owner?.businesses.find((b) => b.id === businessId);
  if (!owner || !membership) return null;
  return membership.role === "owner" ? "owner" : "staff";
}

// Owner-only: this stores the business's courier credentials, the same
// protection level as the other settings that change what Mira is allowed
// to do on the owner's behalf.
export async function connectCourier(businessId: string, provider: string, webhookSecret: string) {
  const role = await membershipRole(businessId);
  if (!role) return { error: "Not authorized." };
  if (role !== "owner") return { error: "Only the business owner can change this." };

  const result = await saveConnection(createServiceRoleClient(), { businessId, provider, webhookSecret });
  if (!result.ok) return { error: result.error };

  revalidatePath(`/portal/${businessId}/settings`);
  revalidatePath(`/portal/${businessId}/orders`);
  return { error: null };
}

export async function disconnectCourier(businessId: string, provider: string) {
  const role = await membershipRole(businessId);
  if (!role) return { error: "Not authorized." };
  if (role !== "owner") return { error: "Only the business owner can change this." };

  const result = await disconnect(createServiceRoleClient(), { businessId, provider });
  if (!result.ok) return { error: result.error };

  revalidatePath(`/portal/${businessId}/settings`);
  revalidatePath(`/portal/${businessId}/orders`);
  return { error: null };
}

// Any team member can do this, like updating an order's status: it only
// attaches a reference the courier already issued to an order that
// belongs to this business. It books nothing and spends nothing.
export async function linkCourierReference(businessId: string, orderId: string, provider: string, reference: string) {
  const role = await membershipRole(businessId);
  if (!role) return { error: "Not authorized." };

  const result = await linkShipmentToOrder(createServiceRoleClient(), { businessId, orderId, provider, reference });
  if (!result.ok) return { error: result.error };

  revalidatePath(`/portal/${businessId}/orders`);
  return { error: null };
}
