import { createClient } from "@/lib/supabase/server";
import type { createServiceRoleClient } from "@/lib/supabase/service-role";
import { isLocked, remainingTrialDays, type BusinessSubscription } from "@/lib/plans";

export async function getBusinessEntitlement(businessId: string) {
  const supabase = await createClient();
  const { data: subscription, error } = await supabase
    .from("business_subscriptions")
    .select("owner_id, plan, status, trial_started_at, trial_ends_at, expires_at")
    .eq("business_id", businessId)
    .maybeSingle();

  const typedSubscription = (subscription ?? null) as BusinessSubscription | null;
  return {
    subscription: typedSubscription,
    error,
    entitled: !isLocked(typedSubscription),
    trialDaysRemaining: remainingTrialDays(typedSubscription),
  };
}

export async function provisionBusinessTrial(
  supabase: Awaited<ReturnType<typeof createClient>>,
  businessId: string,
  ownerId: string,
) {
  return supabase.rpc("provision_business_trial", {
    p_business_id: businessId,
    p_owner_id: ownerId,
  });
}

/**
 * Entitlement check for webhook/queue paths that run with the service-role
 * client. Locked businesses must be skipped BEFORE any conversation or
 * message write, because the DB trigger raises SUBSCRIPTION_REQUIRED on them.
 */
export async function isBusinessEntitled(
  client: Pick<ReturnType<typeof createServiceRoleClient>, "from">,
  businessId: string,
): Promise<boolean> {
  const { data, error } = await client
    .from("business_subscriptions")
    .select("owner_id, plan, status, trial_started_at, trial_ends_at, expires_at")
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) throw error;
  return !isLocked((data ?? null) as BusinessSubscription | null);
}
