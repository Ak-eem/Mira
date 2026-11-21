// What the webhook does with the database's answer to a refund or chargeback: validate it,
// and turn it into an operator alert. Pure (no I/O) so it is tested in refunds.test.ts.
//
// The point of the alert is that a refund or chargeback is rare, involves real money, and
// previously left no trace anywhere. The operator now sees each one, with what Mira did.

import type { Alert } from "@/lib/alerts/core";

export type RefundOutcome =
  | "unknown_reference"
  | "partial_recorded"
  | "already_applied"
  | "no_active_subscription"
  | "unchanged"
  | "shortened"
  | "revoked"
  | "needs_review";

const OUTCOMES: readonly RefundOutcome[] = [
  "unknown_reference", "partial_recorded", "already_applied", "no_active_subscription",
  "unchanged", "shortened", "revoked", "needs_review",
];

export type RefundResult = {
  outcome: RefundOutcome;
  reference?: string;
  businessId?: string;
  amountKobo?: number;
  refundedKobo?: number;
  expiresBefore?: string | null;
  expiresAfter?: string | null;
  reason?: string;
};

export type DisputeResult = {
  outcome: "recorded" | "unknown_reference";
  firstTime: boolean;
  reference?: string;
  businessId?: string;
  amountKobo?: number;
};

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
function int(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : undefined;
}

export function parseRefundResult(value: unknown): RefundResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const outcome = OUTCOMES.find((o) => o === v.outcome);
  if (!outcome) return null;
  return {
    outcome,
    reference: str(v.reference),
    businessId: str(v.business_id),
    amountKobo: int(v.amount),
    refundedKobo: int(v.refunded_amount),
    expiresBefore: typeof v.expires_before === "string" ? v.expires_before : null,
    expiresAfter: typeof v.expires_after === "string" ? v.expires_after : null,
    reason: str(v.reason),
  };
}

export function parseDisputeResult(value: unknown): DisputeResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (v.outcome !== "recorded" && v.outcome !== "unknown_reference") return null;
  return {
    outcome: v.outcome,
    firstTime: v.first_time === true,
    reference: str(v.reference),
    businessId: str(v.business_id),
    amountKobo: int(v.amount),
  };
}

// Paystack amounts are in kobo.
export function nairaFromKobo(kobo: number | undefined): string {
  if (kobo === undefined) return "an unknown amount";
  return `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;
}

function when(iso: string | null | undefined): string {
  if (!iso) return "unknown";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "unknown" : d.toLocaleDateString("en-GB", { timeZone: "Africa/Lagos", day: "numeric", month: "short", year: "numeric" });
}

const ONE_DAY_MINUTES = 24 * 60;

// null = nothing worth telling the operator (a replayed event that changed nothing).
export function refundAlert(result: RefundResult, reference: string, businessName: string | null): Alert | null {
  if (result.outcome === "already_applied") return null;

  const who = businessName ?? "an unknown business";
  const amount = nairaFromKobo(result.amountKobo);
  const lines: string[] = [`Business: ${who}`, `Payment: ${reference} (${amount})`];
  let headline: string;

  switch (result.outcome) {
    case "shortened":
      headline = `Refund processed for ${who}: access shortened`;
      lines.push("Mira removed the days that payment had bought; the business keeps the rest.");
      lines.push(`Access now ends: ${when(result.expiresAfter)} (was ${when(result.expiresBefore)}).`);
      break;
    case "revoked":
      headline = `Refund processed for ${who}: subscription cancelled`;
      lines.push("Nothing paid is left after the refund, so Mira cancelled the subscription.");
      break;
    case "unchanged":
      headline = `Refund processed for ${who}: access unchanged`;
      lines.push("The days that payment bought had already passed, so current access was left alone.");
      break;
    case "partial_recorded":
      headline = `Partial refund for ${who}`;
      lines.push(`Refunded so far: ${nairaFromKobo(result.refundedKobo)} of ${amount}. Access was not changed.`);
      lines.push("If this should end their access, cancel or shorten the subscription by hand in Admin.");
      break;
    case "no_active_subscription":
      headline = `Refund processed for ${who}: no active subscription`;
      lines.push("The refund is recorded. The business had no active subscription left to change.");
      break;
    case "needs_review":
      headline = `Refund needs your review: ${who}`;
      lines.push(result.reason ?? "Mira could not work out which days to remove.");
      lines.push("Check the business's subscription in Admin and adjust it by hand if needed.");
      break;
    case "unknown_reference":
      headline = "Refund for a payment Mira has no record of";
      lines.push("Paystack reports a refund for a payment that is not in Mira's records, so nothing was changed.");
      lines.push("Check the transaction in the Paystack dashboard.");
      break;
  }
  return {
    key: `refund-${reference}-${result.outcome}`,
    subject: headline,
    lines,
    cooldownMinutes: ONE_DAY_MINUTES,
  };
}

// Chargebacks have a response deadline at Paystack, so every new event is worth an email, and
// Paystack's reminder events are allowed through at most once a day.
export function disputeAlert(event: string, result: DisputeResult | null, reference: string | undefined, businessName: string | null): Alert | null {
  const isReminder = event.endsWith(".remind");
  if (result && result.outcome === "recorded" && !result.firstTime && !isReminder && event.endsWith(".create")) return null;

  const who = businessName ?? "an unknown business";
  const lines: string[] = [`Event: ${event}`];
  if (reference) lines.push(`Payment: ${reference}${result?.amountKobo !== undefined ? ` (${nairaFromKobo(result.amountKobo)})` : ""}`);
  if (businessName || result?.businessId) lines.push(`Business: ${who}`);
  if (!result || result.outcome === "unknown_reference") {
    lines.push("This payment is not in Mira's records. Check the transaction in the Paystack dashboard.");
  }
  lines.push("A chargeback usually has a deadline to respond. Open the Paystack dashboard, find the dispute, and send your evidence in time; access was not changed.");

  return {
    key: `dispute-${event}-${reference ?? "unknown"}`,
    subject: `Chargeback ${isReminder ? "reminder" : "event"}: ${who}`,
    lines,
    cooldownMinutes: isReminder ? 20 * 60 : ONE_DAY_MINUTES,
  };
}

// True when the database is missing the function being called, which happens if the app is
// deployed before the migration is applied. The webhook then falls back to the older behaviour
// instead of failing a real payment or refund.
export function isMissingFunctionError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "PGRST202" || error.code === "42883") return true;
  return /could not find the function|function .* does not exist/i.test(error.message ?? "");
}
