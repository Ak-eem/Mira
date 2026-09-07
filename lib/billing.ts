import { createClient } from "@/lib/supabase/server";
import { hasEntitlement, remainingTrialDays, type BusinessSubscription } from "@/lib/plans";

export async function getBusinessEntitlement(businessId: string) {
  const supabase = await createClient();
  const { data: subscription } = await supabase
    .from("business_subscriptions")
    .select("plan, status, trial_started_at, trial_ends_at")
    .eq("business_id", businessId)
    .maybeSingle();

  const typedSubscription = (subscription ?? null) as BusinessSubscription | null;
  return {
    subscription: typedSubscription,
    entitled: hasEntitlement(typedSubscription),
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
