import { activateWithPeriod } from "./activation";
import { disputeAlert, isMissingFunctionError, nairaFromKobo, parseDisputeResult, parseRefundResult, refundAlert } from "./refunds";

function check(condition: boolean, message: string): void {
  console.log(`${condition ? "PASS" : "FAIL"} - ${message}`);
  if (!condition) process.exitCode = 1;
}

// --- parsing what the database returns ---
const shortened = parseRefundResult({ outcome: "shortened", reference: "r1", business_id: "b1", amount: 1_000_000, refunded_amount: 1_000_000, expires_before: "2026-12-30T10:00:00Z", expires_after: "2026-12-10T10:00:00Z" });
check(shortened?.outcome === "shortened" && shortened.amountKobo === 1_000_000 && shortened.businessId === "b1", "a valid refund result is parsed");
check(parseRefundResult(null) === null && parseRefundResult("x") === null && parseRefundResult([]) === null, "non-objects are rejected");
check(parseRefundResult({ outcome: "made-up" }) === null && parseRefundResult({}) === null, "an unknown outcome is rejected");
check(parseRefundResult({ outcome: "revoked", amount: "100" })?.amountKobo === undefined, "a non-numeric amount is ignored, not trusted");
check(parseDisputeResult({ outcome: "recorded", first_time: true, reference: "r1" })?.firstTime === true, "a dispute result is parsed");
check(parseDisputeResult({ outcome: "weird" }) === null, "an unknown dispute outcome is rejected");

// --- money formatting ---
check(nairaFromKobo(1_000_000) === "₦10,000", "1,000,000 kobo is ₦10,000");
check(nairaFromKobo(1_050) === "₦10.5", "kobo are shown as decimals");
check(nairaFromKobo(undefined) === "an unknown amount", "a missing amount is described, not shown as zero");

// --- refund alerts ---
check(refundAlert({ outcome: "already_applied" }, "r1", "Ada's Shop") === null, "a replayed refund sends no alert");
const a1 = refundAlert(shortened!, "r1", "Ada's Shop")!;
check(a1.subject.includes("Ada's Shop") && a1.subject.includes("shortened"), "a shortened refund names the business and what happened");
check(a1.lines.some((l) => l.includes("30 Dec 2026") || l.includes("10 Dec 2026")), "it shows the old and new expiry dates");
check(a1.key === "refund-r1-shortened", "the alert key is per payment and outcome, so two refunds don't silence each other");
check(refundAlert({ outcome: "revoked", amountKobo: 5_000_000 }, "r2", "Bola Fashion")!.subject.includes("cancelled"), "a cancelling refund says so");
const review = refundAlert({ outcome: "needs_review", reason: "predates day tracking" }, "r3", null)!;
check(review.subject.includes("needs your review") && review.lines.some((l) => l.includes("predates day tracking")) && review.lines.some((l) => l.includes("an unknown business")), "needs_review carries the reason and works without a business name");
check(refundAlert({ outcome: "partial_recorded", amountKobo: 1_000_000, refundedKobo: 400_000 }, "r4", "X")!.lines.some((l) => l.includes("₦4,000 of ₦10,000")), "a partial refund shows how much of the payment was refunded");
check(refundAlert({ outcome: "unknown_reference" }, "ghost", null)!.subject.includes("no record"), "a refund for an unknown payment is flagged");
for (const outcome of ["unchanged", "no_active_subscription"] as const) {
  check(refundAlert({ outcome }, "r5", "X") !== null, `'${outcome}' is still reported (the operator should know every refund happened)`);
}

// --- dispute alerts ---
const first = disputeAlert("charge.dispute.create", { outcome: "recorded", firstTime: true, reference: "d1", businessId: "b1", amountKobo: 2_000_000 }, "d1", "Ada's Shop")!;
check(first.subject.includes("Ada's Shop") && first.lines.some((l) => l.includes("deadline")), "a new chargeback alerts with a reminder of the response deadline");
check(first.lines.some((l) => l.includes("₦20,000")), "the chargeback shows the amount");
check(disputeAlert("charge.dispute.create", { outcome: "recorded", firstTime: false }, "d1", "X") === null, "a repeated 'create' event does not re-alert");
const remind = disputeAlert("charge.dispute.remind", { outcome: "recorded", firstTime: false }, "d1", "X")!;
check(remind !== null && remind.subject.includes("reminder") && remind.key === "dispute-charge.dispute.remind-d1", "Paystack's reminders still alert");
check((remind.cooldownMinutes ?? 0) < 24 * 60, "reminders can alert about once a day");
check(disputeAlert("charge.dispute.create", null, "d2", null)!.lines.some((l) => l.includes("not in Mira's records")), "if the database call failed or the payment is unknown, the alert still goes out and says so");

// --- missing-function detection ---
check(isMissingFunctionError({ code: "PGRST202" }) && isMissingFunctionError({ code: "42883" }), "PostgREST and Postgres 'function not found' codes are recognised");
check(isMissingFunctionError({ message: "Could not find the function public.refund_paystack_payment(p_reference) in the schema cache" }), "the 'could not find the function' message is recognised");
check(!isMissingFunctionError({ message: "boom" }) && !isMissingFunctionError({ code: "23505" }) && !isMissingFunctionError(null), "other errors are not mistaken for a missing function");

// --- activation fallback ---
async function run() {
  const params = { p_business_id: "b", p_user_id: "u", p_reference: "r", p_amount: 1, p_expires_at: "2026-12-01T00:00:00Z", p_expected_amount_kobo: 1, p_plan: "base" };
  let calls: Record<string, unknown>[] = [];
  const ok = async (_n: string, args: Record<string, unknown>) => { calls.push(args); return { error: null }; };
  await activateWithPeriod(ok, params, 30);
  check(calls.length === 1 && calls[0].p_period_days === 30, "activation passes how many days the payment bought");

  calls = [];
  const oldDb = async (_n: string, args: Record<string, unknown>) => {
    calls.push(args);
    return "p_period_days" in args ? { error: { code: "PGRST202", message: "Could not find the function" } } : { error: null };
  };
  const res = await activateWithPeriod(oldDb, params, 30);
  check(res.error === null && calls.length === 2 && !("p_period_days" in calls[1]), "before the migration, activation retries without the new argument and still succeeds");

  calls = [];
  const failing = async (_n: string, args: Record<string, unknown>) => { calls.push(args); return { error: { message: "user is no longer associated with this business" } }; };
  const bad = await activateWithPeriod(failing, params, 30);
  check(bad.error !== null && calls.length === 1, "a genuine activation error is returned, not retried");
}
run().then(() => undefined);
