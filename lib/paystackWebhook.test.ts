import { createHmac } from "node:crypto";
import { Module } from "node:module";

// Route-level tests for the Paystack webhook: the REAL handler runs, with
// Supabase's REST API replaced by an in-memory fake (global fetch). That
// proves what the money path does -- not just what helpers return.

type ModuleLoader = (request: string, ...rest: unknown[]) => unknown;
const originalLoad = (Module as unknown as { _load: ModuleLoader })._load;
(Module as unknown as { _load: ModuleLoader })._load = function patchedLoad(request, ...rest) {
  if (request === "server-only") return {};
  return originalLoad.call(Module, request, ...rest);
};

process.env.PAYSTACK_SECRET_KEY = "sk_test_secret";
process.env.PAYSTACK_BASE_AMOUNT_NGN = "10000";
process.env.PAYSTACK_BASE_PROMO_AMOUNT_NGN = "5000";
process.env.PAYSTACK_BASE_DURATION_DAYS = "30";
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://supabase.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
delete process.env.PAYSTACK_WEBHOOK_IPS;
process.env.ALERT_EMAIL_TO = "ops@example.com";
process.env.RESEND_API_KEY = "re_test";
process.env.RESEND_FROM_EMAIL = "mira@example.com";

function check(condition: boolean, message: string): void {
  console.log(`${condition ? "PASS" : "FAIL"} - ${message}`);
  if (!condition) process.exitCode = 1;
}

type RpcCall = { name: string; body: Record<string, unknown> };
let rpcCalls: RpcCall[] = [];
let alreadyActive = false;
let rpcError: { message: string } | null = null;
let rpcResults: Record<string, unknown> = {}; // what a given database function returns
let rpcMissing = new Set<string>(); // functions the database "does not have yet" (migration not applied)
let emails: { to: string[]; subject: string }[] = [];

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  const json = (value: unknown, status = 200) =>
    new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
  if (url.hostname === "api.resend.com") {
    const body = JSON.parse(String(init?.body ?? "{}"));
    emails.push({ to: body.to, subject: body.subject });
    return json({ id: "email-1" });
  }
  if (url.pathname.startsWith("/rest/v1/rpc/")) {
    const name = url.pathname.split("/").pop()!;
    const body = JSON.parse(String(init?.body ?? "{}"));
    rpcCalls.push({ name, body });
    if (rpcMissing.has(name)) return json({ code: "PGRST202", message: `Could not find the function public.${name} in the schema cache` }, 404);
    if (rpcError && !(name in rpcResults)) return json(rpcError, 400);
    return name in rpcResults ? json(rpcResults[name]) : new Response(null, { status: 204 });
  }
  if (url.pathname === "/rest/v1/businesses") return json([{ name: "Ada Fashion" }]);
  if (url.pathname === "/rest/v1/business_subscriptions") return json(alreadyActive ? [{ business_id: "biz-1" }] : []);
  return json([]);
}) as typeof fetch;

const BIZ = "11111111-1111-1111-1111-111111111111";
const USER = "22222222-2222-2222-2222-222222222222";

function chargeEvent(over: { amount?: number; currency?: string; metadata?: Record<string, unknown>; status?: string } = {}) {
  return {
    event: "charge.success",
    data: {
      reference: "ref_123",
      status: over.status ?? "success",
      currency: over.currency ?? "NGN",
      amount: over.amount ?? 1_000_000,
      metadata: over.metadata ?? { user_id: USER, business_id: BIZ, plan: "base", promo: false },
    },
  };
}

async function send(event: unknown, opts: { signature?: string | null } = {}) {
  const { POST } = await import("@/app/api/paystack/webhook/route");
  const raw = JSON.stringify(event);
  const signature = opts.signature === undefined ? createHmac("sha512", "sk_test_secret").update(raw).digest("hex") : opts.signature;
  const headers: Record<string, string> = { "content-type": "application/json", "x-forwarded-for": "52.31.139.75" };
  if (signature) headers["x-paystack-signature"] = signature;
  rpcCalls = [];
  emails = [];
  const response = await POST(new Request("http://localhost/api/paystack/webhook", { method: "POST", headers, body: raw }));
  return { status: response.status, calls: [...rpcCalls], emails: [...emails] };
}

async function main() {
  let r = await send(chargeEvent(), { signature: "deadbeef" });
  check(r.status === 401 && r.calls.length === 0, "bad signature -> 401 and nothing activated");

  r = await send(chargeEvent(), { signature: null });
  check(r.status === 401 && r.calls.length === 0, "missing signature -> 401 and nothing activated");

  r = await send(chargeEvent());
  const activate = r.calls.find((c) => c.name === "activate_paystack_subscription");
  check(r.status === 200 && !!activate, "valid charge.success -> 200 and activation RPC called");
  check(typeof activate?.body.p_expires_at === "string" && activate?.body.p_business_id === BIZ && activate?.body.p_user_id === USER, "activation passes expiry, business and user");
  check(activate?.body.p_expected_amount_kobo === 1_000_000 && activate?.body.p_amount === 1_000_000, "activation passes the paid and expected amounts");
  check(activate?.body.p_period_days === 30, "activation tells the database how many days this payment bought (so a refund can remove exactly those)");

  // Deployed before migration 0077: the database does not know p_period_days yet. The payment must still go through.
  rpcMissing = new Set(["activate_paystack_subscription"]);
  r = await send(chargeEvent());
  check(r.status === 500, "if activation itself is missing entirely, Paystack is asked to retry");
  rpcMissing = new Set();
  const oldDbCalls: RpcCall[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.pathname === "/rest/v1/rpc/activate_paystack_subscription") {
      const body = JSON.parse(String(init?.body ?? "{}"));
      oldDbCalls.push({ name: "activate_paystack_subscription", body });
      if ("p_period_days" in body) return new Response(JSON.stringify({ code: "PGRST202", message: "Could not find the function public.activate_paystack_subscription" }), { status: 404, headers: { "content-type": "application/json" } });
      return new Response(null, { status: 204 });
    }
    return realFetch(input, init);
  }) as typeof fetch;
  r = await send(chargeEvent());
  globalThis.fetch = realFetch;
  check(r.status === 200 && oldDbCalls.length === 2 && !("p_period_days" in oldDbCalls[1].body), "before the migration, activation retries without p_period_days and the payment still succeeds");

  // Price env changed after checkout: the quoted price in metadata must still win.
  r = await send(chargeEvent({ amount: 750_000, metadata: { user_id: USER, business_id: BIZ, plan: "base", promo: false, amount_kobo: 750_000 } }));
  check(r.status === 200 && r.calls.some((c) => c.name === "activate_paystack_subscription"), "quoted amount_kobo is honored even if it differs from the current env price");

  r = await send(chargeEvent({ amount: 100 }));
  check(r.status === 500 && r.calls.length === 0, "amount mismatch -> 500 (so Paystack retries) and nothing activated");

  r = await send(chargeEvent({ currency: "USD" }));
  check(r.status === 400 && r.calls.length === 0, "non-NGN charge is rejected");

  r = await send(chargeEvent({ status: "failed" }));
  check(r.status === 400 && r.calls.length === 0, "non-success status is rejected");

  r = await send(chargeEvent({ metadata: { plan: "base", promo: false } }));
  check(r.status === 400 && r.calls.length === 0, "missing user/business metadata is rejected");

  r = await send(chargeEvent({ metadata: { user_id: USER, business_id: BIZ, plan: "pro", promo: false } }));
  check(r.status === 400 && r.calls.length === 0, "unknown plan is rejected");

  alreadyActive = true;
  r = await send(chargeEvent());
  check(r.status === 200 && r.calls.length === 0, "replay of an already-applied reference is a cheap 200 with no RPC");
  alreadyActive = false;

  rpcError = { message: "user is no longer associated with this business" };
  r = await send(chargeEvent());
  check(r.status === 200, "'no longer associated' is acknowledged (not retried forever)");
  rpcError = { message: "boom" };
  r = await send(chargeEvent());
  check(r.status === 500, "an unexpected RPC failure answers 500 so Paystack retries");
  rpcError = null;

  // ---- refunds ----
  rpcResults = { refund_paystack_payment: { outcome: "shortened", reference: "ref_123", business_id: BIZ, amount: 1_000_000, refunded_amount: 1_000_000, expires_before: "2026-12-30T10:00:00Z", expires_after: "2026-12-10T10:00:00Z" } };
  r = await send({ event: "refund.processed", data: { transaction_reference: "ref_123", amount: 1_000_000 } });
  const refund = r.calls.find((c) => c.name === "refund_paystack_payment");
  check(r.status === 200 && refund?.body.p_reference === "ref_123" && refund?.body.p_refund_amount === 1_000_000, "refund.processed asks the database to refund that payment");
  check(!r.calls.some((c) => c.name === "revoke_paystack_subscription"), "the old revoke function is no longer used when the new one exists");
  check(r.emails.length === 1 && r.emails[0].to[0] === "ops@example.com" && r.emails[0].subject.includes("Ada Fashion") && r.emails[0].subject.includes("shortened"), "the operator is emailed what happened, naming the business");

  r = await send({ event: "refund.processed", data: { transaction: { reference: "ref_nested" } } });
  check(r.calls.some((c) => c.name === "refund_paystack_payment" && c.body.p_reference === "ref_nested" && c.body.p_refund_amount === null), "a nested transaction.reference is handled, and a missing amount is passed as null (full refund)");

  rpcResults = { refund_paystack_payment: { outcome: "already_applied", reference: "ref_123", business_id: BIZ, amount: 1_000_000, refunded_amount: 1_000_000 } };
  r = await send({ event: "refund.processed", data: { transaction_reference: "ref_123", amount: 1_000_000 } });
  check(r.status === 200 && r.emails.length === 0, "a replayed refund is acknowledged without a second email");

  rpcResults = { refund_paystack_payment: { outcome: "needs_review", reference: "ref_old", business_id: BIZ, amount: 1_000_000, refunded_amount: 1_000_000, reason: "predates day tracking" } };
  r = await send({ event: "refund.processed", data: { transaction_reference: "ref_old" } });
  check(r.status === 200 && r.emails.length === 1 && r.emails[0].subject.includes("needs your review"), "a refund Mira cannot resolve by itself emails the operator to review it");

  rpcResults = { refund_paystack_payment: "garbage" };
  r = await send({ event: "refund.processed", data: { transaction_reference: "ref_x" } });
  check(r.status === 200 && r.emails.length === 1 && r.emails[0].subject.includes("unreadable"), "an unreadable database answer is flagged to the operator, not swallowed");
  rpcResults = {};

  rpcMissing = new Set(["refund_paystack_payment"]);
  r = await send({ event: "refund.processed", data: { transaction_reference: "ref_123", amount: 1_000_000 } });
  const legacy = r.calls.find((c) => c.name === "revoke_paystack_subscription");
  check(r.status === 200 && legacy?.body.p_reference === "ref_123" && legacy?.body.p_refund_amount === 1_000_000, "before the migration, refunds still work the older way");
  check(r.emails.length === 1 && r.emails[0].subject.includes("0077"), "and the operator is told to apply the migration");
  rpcMissing = new Set();

  rpcError = { message: "boom" };
  r = await send({ event: "refund.processed", data: { transaction_reference: "ref_123" } });
  check(r.status === 500 && r.emails.length === 0, "an unexpected refund failure answers 500 so Paystack retries");
  rpcError = null;

  // ---- chargebacks ----
  rpcResults = { record_paystack_dispute: { outcome: "recorded", first_time: true, reference: "ref_123", business_id: BIZ, amount: 2_000_000 } };
  r = await send({ event: "charge.dispute.create", data: { transaction: { reference: "ref_123" } } });
  check(r.status === 200 && r.calls.some((c) => c.name === "record_paystack_dispute" && c.body.p_reference === "ref_123"), "a chargeback is recorded against the payment");
  check(!r.calls.some((c) => c.name === "revoke_paystack_subscription" || c.name === "refund_paystack_payment"), "a chargeback does not change access");
  check(r.emails.length === 1 && r.emails[0].subject.includes("Ada Fashion"), "a new chargeback emails the operator");

  rpcResults = { record_paystack_dispute: { outcome: "recorded", first_time: false, reference: "ref_123", business_id: BIZ, amount: 2_000_000 } };
  r = await send({ event: "charge.dispute.create", data: { transaction: { reference: "ref_123" } } });
  check(r.status === 200 && r.emails.length === 0, "a repeated chargeback event does not email again");
  r = await send({ event: "charge.dispute.remind", data: { transaction: { reference: "ref_123" } } });
  check(r.status === 200 && r.emails.length === 1 && r.emails[0].subject.includes("reminder"), "Paystack's chargeback reminders still reach the operator");

  rpcMissing = new Set(["record_paystack_dispute"]);
  rpcResults = {};
  r = await send({ event: "charge.dispute.create", data: { transaction: { reference: "ref_123" } } });
  check(r.status === 200 && r.emails.length === 1, "even if the database call fails, the operator is still emailed about the chargeback");
  rpcMissing = new Set();

  r = await send({ event: "charge.dispute.create", data: {} });
  check(r.status === 200 && r.calls.length === 0 && r.emails.length === 1, "a chargeback with no reference is acknowledged and emailed");

  r = await send({ event: "transfer.success", data: {} });
  check(r.status === 200 && r.calls.length === 0, "unrelated events are acknowledged and ignored");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
