import { isLocked, isTrialActive, type BusinessSubscription } from "@/lib/plans";

export type SubscriptionCounts = { onTrial: number; active: number; needsPayment: number };

/**
 * Dashboard numbers. A trial whose end date has passed is NOT "on trial" (the business is locked out and its list
 * row says "Upgrade required"), so it counts as needing payment, as do past-due, cancelled and lapsed paid plans.
 */
export function countSubscriptions(subscriptions: Array<Pick<BusinessSubscription, "status" | "trial_ends_at" | "expires_at">>): SubscriptionCounts {
  const counts: SubscriptionCounts = { onTrial: 0, active: 0, needsPayment: 0 };
  for (const subscription of subscriptions) {
    if (isTrialActive(subscription as BusinessSubscription)) counts.onTrial += 1;
    else if (!isLocked(subscription as BusinessSubscription)) counts.active += 1;
    else counts.needsPayment += 1;
  }
  return counts;
}
