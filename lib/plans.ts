export const TRIAL_LENGTH_DAYS = 14;

export const PLAN_DEFINITIONS = {
  base: { name: "Base", price: 0 },
  pro: { name: "Pro", price: 49 },
} as const;

export type SubscriptionStatus = "trialing" | "active" | "past_due" | "cancelled";

export type BusinessSubscription = {
  plan: keyof typeof PLAN_DEFINITIONS;
  status: SubscriptionStatus;
  trial_started_at: string | null;
  trial_ends_at: string | null;
};

/** Missing subscription rows are treated as legacy access for compatibility. */
export function hasEntitlement(subscription: BusinessSubscription | null | undefined): boolean {
  if (!subscription) return true;
  if (subscription.status === "active") return true;
  return subscription.status === "trialing" && Boolean(subscription.trial_ends_at)
    && new Date(subscription.trial_ends_at as string).getTime() > Date.now();
}

export function remainingTrialDays(subscription: BusinessSubscription | null | undefined): number | null {
  if (!subscription?.trial_ends_at || subscription.status !== "trialing") return null;
  const milliseconds = new Date(subscription.trial_ends_at).getTime() - Date.now();
  return Math.max(0, Math.ceil(milliseconds / 86_400_000));
}

export function subscriptionLabel(subscription: BusinessSubscription | null | undefined): string {
  if (!subscription) return "Active";
  if (subscription.status === "trialing") {
    const days = remainingTrialDays(subscription);
    return days === null ? "Trial" : `${days} day${days === 1 ? "" : "s"} left in trial`;
  }
  return subscription.status === "active" ? `${PLAN_DEFINITIONS[subscription.plan].name} plan` : "Upgrade required";
}
