export const TRIAL_LENGTH_DAYS = 14;

export const PLAN_DEFINITIONS = {
  base: { name: "Base", price: 0 },
  pro: { name: "Pro", price: 49 },
} as const;

export type SubscriptionStatus = "trialing" | "active" | "past_due" | "cancelled";

export type BusinessSubscription = {
  owner_id?: string | null;
  plan: keyof typeof PLAN_DEFINITIONS;
  status: SubscriptionStatus;
  trial_started_at: string | null;
  trial_ends_at: string | null;
};

/** True only while the business_subscriptions row is an unexpired trial. */
export function isTrialActive(subscription: BusinessSubscription | null | undefined): boolean {
  if (!subscription || subscription.status !== "trialing" || !subscription.trial_ends_at) return false;
  const trialEndsAt = new Date(subscription.trial_ends_at).getTime();
  return Number.isFinite(trialEndsAt) && trialEndsAt > Date.now();
}

/** business_subscriptions is the billing source of truth; missing/expired states are locked. */
export function isLocked(subscription: BusinessSubscription | null | undefined): boolean {
  return !subscription || (subscription.status !== "active" && !isTrialActive(subscription));
}

export function hasEntitlement(subscription: BusinessSubscription | null | undefined): boolean {
  return !isLocked(subscription);
}

export function remainingTrialDays(subscription: BusinessSubscription | null | undefined): number | null {
  if (!isTrialActive(subscription) || !subscription) return null;
  const milliseconds = new Date(subscription.trial_ends_at as string).getTime() - Date.now();
  return Math.max(0, Math.ceil(milliseconds / 86_400_000));
}

export function subscriptionLabel(subscription: BusinessSubscription | null | undefined): string {
  if (!subscription) return "Upgrade required";
  if (isTrialActive(subscription)) {
    const days = remainingTrialDays(subscription);
    return `${days} day${days === 1 ? "" : "s"} left in trial`;
  }
  return subscription.status === "active" && subscription.plan in PLAN_DEFINITIONS
    ? `${PLAN_DEFINITIONS[subscription.plan].name} plan`
    : "Upgrade required";
}
