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

function check(condition: boolean, message: string): void {
  console.log(`${condition ? "PASS" : "FAIL"} - ${message}`);
  if (!condition) process.exitCode = 1;
}

type RpcCall = { name: string; body: Record<string, unknown> };
let rpcCalls: RpcCall[] = [];
let alreadyActive = false;
let rpcError: { message: string } | null = null;

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  const json = (value: unknown, status = 200) =>
    new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
  if (url.pathname.startsWith("/rest/v1/rpc/")) {
    rpcCalls.push({ name: url.pathname.split("/").pop()!, body: JSON.parse(String(init?.body ?? "{}")) });
    return rpcError ? json(rpcError, 400) : new Response(null, { status: 204 });
  }
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
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (signature) headers["x-paystack-signature"] = signature;
  rpcCalls = [];
  const response = await POST(new Request("http://localhost/api/paystack/webhook", { method: "POST", headers, body: raw }));
  return { status: response.status, calls: [...rpcCalls] };
}

async function main() {
  let r = await send(chargeEvent(), { signature: "deadbeef" });
  check(r.status === 401 && r.calls.length === 0, "bad signature -> 401 and nothing activated");

  r = await send(chargeEvent(), { signature: null });
  check(r.status === 401 && r.calls.length === 0, "missing signature -> 401 and nothing activated");

  r = await send(chargeEvent());
  const activate = r.calls.find((c) => c.name === "activate_paystack_subscription");
  check(r.status === 200 && !!activate, "valid charge.success -> 200 and activation RPC called");
  check(activate?.body.p_duration_days === 30 && activate?.body.p_business_id === BIZ && activate?.body.p_user_id === USER, "activation passes duration, business and user");
  check(activate?.body.p_expected_amount_kobo === 1_000_000 && activate?.body.p_amount === 1_000_000, "activation passes the paid and expected amounts");

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

  r = await send({ event: "refund.processed", data: { transaction_reference: "ref_123", amount: 1_000_000 } });
  const revoke = r.calls.find((c) => c.name === "revoke_paystack_subscription");
  check(r.status === 200 && revoke?.body.p_reference === "ref_123" && revoke?.body.p_refund_amount === 1_000_000, "refund.processed revokes the subscription for that reference");

  r = await send({ event: "refund.processed", data: { transaction: { reference: "ref_nested" } } });
  check(r.calls.some((c) => c.name === "revoke_paystack_subscription" && c.body.p_reference === "ref_nested"), "refund with a nested transaction.reference is handled");

  r = await send({ event: "charge.dispute.create", data: { transaction: { reference: "ref_123" } } });
  check(r.status === 200 && r.calls.length === 0, "dispute events are logged, not auto-revoked");

  r = await send({ event: "transfer.success", data: {} });
  check(r.status === 200 && r.calls.length === 0, "unrelated events are acknowledged and ignored");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
