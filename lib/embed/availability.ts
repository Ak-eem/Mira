import { isCancelled } from "../plans";
import type { createServiceRoleClient } from "../supabase/service-role";

type Client = ReturnType<typeof createServiceRoleClient>;

// Should the chat widget appear on this business's website?
//   false = the business is missing, inactive or CANCELLED
//   true  = anything else, including a locked/unpaid business (which keeps its
//           existing "temporarily unavailable" message)
// Throws on a database error so the caller can decide to fail open.
export async function getEmbedAvailability(client: Client, slug: string): Promise<boolean> {
  const business = await client.from("businesses").select("id,is_active").eq("slug", slug).maybeSingle();
  if (business.error) throw business.error;
  if (!business.data || !business.data.is_active) return false;

  const { data: subscription, error } = await client
    .from("business_subscriptions")
    .select("status")
    .eq("business_id", business.data.id)
    .maybeSingle();
  if (error) throw error;

  return !isCancelled(subscription);
}
