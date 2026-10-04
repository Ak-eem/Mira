import { isLocked, type BusinessSubscription } from "../plans";
import type { createServiceRoleClient } from "../supabase/service-role";

type Client = ReturnType<typeof createServiceRoleClient>;

// True when Mira must stay silent for this business: cancelled, a paid period that
// has ended, a trial that has ended, or no subscription at all. This is the same
// rule the web chat uses (isLocked), so every channel pauses and resumes together:
// the moment a payment makes the subscription active again this returns false.
//
// Throws on a database error (never answers "fine" by guessing) so callers retry
// instead of replying on behalf of a business that has been switched off.
export async function isBusinessSwitchedOff(client: Client, businessId: string): Promise<boolean> {
  const { data, error } = await client
    .from("business_subscriptions")
    .select("owner_id,plan,status,trial_started_at,trial_ends_at,expires_at")
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) throw error;
  return isLocked((data ?? null) as BusinessSubscription | null);
}
