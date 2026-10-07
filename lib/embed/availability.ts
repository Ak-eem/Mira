import { isLocked, type BusinessSubscription } from "../plans";
import type { createServiceRoleClient } from "../supabase/service-role";

type Client = ReturnType<typeof createServiceRoleClient>;

// Should the chat widget appear on this business's website?
//   false = the business is missing/inactive, OR switched off: cancelled, its paid
//           period or trial has ended, or it has no subscription. The bubble
//           disappears from their site and comes back by itself once they pay.
//   true  = paid up or in a live trial.
// Throws on a database error so the caller can decide to fail open.
export async function getEmbedAvailability(client: Client, slug: string): Promise<boolean> {
  const business = await client.from("businesses").select("id,is_active").eq("slug", slug).maybeSingle();
  if (business.error) throw business.error;
  if (!business.data || !business.data.is_active) return false;

  const { data: subscription, error } = await client
    .from("business_subscriptions")
    .select("owner_id,plan,status,trial_started_at,trial_ends_at,expires_at")
    .eq("business_id", business.data.id)
    .maybeSingle();
  if (error) throw error;

  return !isLocked((subscription ?? null) as BusinessSubscription | null);
}
