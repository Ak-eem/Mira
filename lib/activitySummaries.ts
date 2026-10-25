// Plain-language descriptions of what changed, written into the activity log so the feed says more than
// "Subscription/plan updated". Pure, so it is tested.

export type SubscriptionFields = {
  plan?: string | null;
  status?: string | null;
  nudges_addon?: boolean | null;
  nudges_tier?: string | null;
  max_nudges_per_customer_per_week?: number | null;
} | null;

const PLAN: Record<string, string> = { base: "Base", pro: "Pro" };
const plan = (value?: string | null) => (value ? PLAN[value] ?? value : "none");
const onOff = (value?: boolean | null) => (value ? "on" : "off");

export function describeSubscriptionChange(before: SubscriptionFields, after: NonNullable<SubscriptionFields>): string {
  if (!before) {
    return `Subscription created: ${plan(after.plan)} plan, ${after.status ?? "no status"}`;
  }
  const changes: string[] = [];
  if (before.plan !== after.plan) changes.push(`Plan ${plan(before.plan)} \u2192 ${plan(after.plan)}`);
  if (before.status !== after.status) changes.push(`Status ${before.status ?? "none"} \u2192 ${after.status ?? "none"}`);
  if (Boolean(before.nudges_addon) !== Boolean(after.nudges_addon) || (after.nudges_addon && before.nudges_tier !== after.nudges_tier)) {
    const tier = (value?: string | null) => (value ? ` (${value})` : "");
    changes.push(`Nudges add-on ${onOff(before.nudges_addon)}${before.nudges_addon ? tier(before.nudges_tier) : ""} \u2192 ${onOff(after.nudges_addon)}${after.nudges_addon ? tier(after.nudges_tier) : ""}`);
  }
  if (before.max_nudges_per_customer_per_week !== after.max_nudges_per_customer_per_week) {
    changes.push(`Max nudges per customer per week ${before.max_nudges_per_customer_per_week ?? "none"} \u2192 ${after.max_nudges_per_customer_per_week ?? "none"}`);
  }
  return changes.length > 0 ? changes.join(" \u00b7 ") : "Subscription saved, nothing changed";
}
