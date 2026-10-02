// Reason codes for a thumbs-down (customer) or a "needs work" review (staff).
// One list, shared by the widget, the API, the portal and the database check
// constraint in 0053_feedback_reasons.sql -- keep them in step.
export const FEEDBACK_REASONS = ["incorrect", "incomplete", "irrelevant", "outdated", "unclear"] as const;
export type FeedbackReason = (typeof FEEDBACK_REASONS)[number];

export function isFeedbackReason(value: unknown): value is FeedbackReason {
  return typeof value === "string" && (FEEDBACK_REASONS as readonly string[]).includes(value);
}

// Customers and staff judge different things, so the wording differs: a
// customer can tell a reply was confusing, but only the business can tell it
// was out of date.
export const CUSTOMER_REASON_LABELS: Record<FeedbackReason, string> = {
  incorrect: "Wrong info",
  incomplete: "Missing details",
  irrelevant: "Not what I asked",
  outdated: "Out of date",
  unclear: "Confusing",
};

export const STAFF_REASON_LABELS: Record<FeedbackReason, string> = {
  incorrect: "Incorrect",
  incomplete: "Incomplete",
  irrelevant: "Irrelevant",
  outdated: "Outdated",
  unclear: "Unclear",
};

export const STAFF_REASON_HINTS: Record<FeedbackReason, string> = {
  incorrect: "Stated something that isn't true",
  incomplete: "Left out something the customer needed",
  irrelevant: "Didn't answer what was asked",
  outdated: "Was true once, but not any more",
  unclear: "Hard to understand or confusing",
};

export const MAX_FEEDBACK_NOTE_LENGTH = 500;
