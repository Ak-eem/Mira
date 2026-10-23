import { createHmac } from "node:crypto";
import { Module } from "node:module";

// lib/orders/transition.ts (imported by handleShiipWebhook.ts) pulls in
// enough of the Supabase/notification stack that faking its FULL internal
// behavior here would be its own large, error-prone undertaking -- and it
// already has no dedicated fake-client test of its own to extend safely.
// Instead: stub transitionOrderStatus itself, and test that
// handleShiipWebhook (a) only calls it for a terminal "delivered" status,
// never an intermediate one, and (b) calls it with the right businessId,
// orderId and actor: "courier". What transitionOrderStatus does
// internally once called correctly is out of scope for this file.
let transitionCalls: unknown[] = [];
let transitionResult: { ok: true; changed: boolean } | { ok: false; error: string } = { ok: true, changed: true };

type ModuleLoader = (request: string, ...rest: unknown[]) => unknown;
const originalLoad = (Module as unknown as { _load: ModuleLoader })._load;
(Module as unknown as { _load: ModuleLoader })._load = function patchedLoad(request, ...rest) {
  if (request === "server-only") return {};
  if (request.endsWith("/orders/transition") || request === "@/lib/orders/transition") {
    return {
      transitionOrderStatus: async (_supabase: unknown, args: unknown) => {
        transitionCalls.push(args);
        return transitionResult;
      },
    };
  }
  return originalLoad.call(Module, request, ...rest);
};

function check(condition: boolean, message: string): void {
  console.log(`${condition ? "PASS" : "FAIL"} - ${message}`);
  if (!condition) process.exitCode = 1;
}

// In-memory stand-in for business_logistics_accounts and order_shipments,
// supporting exactly the chained calls handleShiipWebhook makes.
function fakeSupabase(opts: {
  account?: { id: string; encrypted_webhook_secret: string | null } | null;
  shipment?: { id: string; order_id: string; status: string } | null;
  accountError?: boolean;
  shipmentError?: boolean;
}) {
  const updates: { table: string; patch: unknown }[] = [];
  const client = {
    from(table: string) {
      if (table === "business_logistics_accounts") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: () =>
                    Promise.resolve(
                      opts.accountError ? { data: null, error: new Error("boom") } : { data: opts.account ?? null, error: null },
                    ),
                }),
              }),
            }),
          }),
        };
      }
      if (table === "order_shipments") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: () =>
                    Promise.resolve(
                      opts.shipmentError ? { data: null, error: new Error("boom") } : { data: opts.shipment ?? null, error: null },
                    ),
                }),
              }),
            }),
          }),
          update: (patch: unknown) => ({
            eq: () => {
              updates.push({ table, patch });
              return Promise.resolve({ error: null });
            },
          }),
        };
      }
      throw new Error(`fakeSupabase: unexpected table "${table}"`);
    },
  };
  return { client: client as never, updates };
}

async function run() {
  const { handleShiipWebhook } = await import("./handleShiipWebhook");

  const secret = "biz-123-shiip-secret";
  const { encryptCredential } = await import("./credentials");
  process.env.LOGISTICS_CREDENTIALS_KEY = require("node:crypto").randomBytes(32).toString("hex");
  const encryptedSecret = encryptCredential(secret);

  const businessId = "11111111-1111-1111-1111-111111111111";

  // --- No active connection ---
  {
    const { client } = fakeSupabase({ account: null });
    const result = await handleShiipWebhook(client, { businessId, rawBody: "{}", signature: "x" });
    check(result.status === 404, "no active Shiip connection for the business: 404, not 401 (not a signature problem)");
  }

  // --- Wrong signature ---
  {
    const { client } = fakeSupabase({ account: { id: "acc1", encrypted_webhook_secret: encryptedSecret } });
    const body = JSON.stringify({ shipment: { data: { reference: "ref1", status: "Delivered" } } });
    const result = await handleShiipWebhook(client, { businessId, rawBody: body, signature: "totally-wrong" });
    check(result.status === 401, "wrong signature: 401");
  }

  // --- Correct signature, no matching shipment ---
  {
    const { client } = fakeSupabase({ account: { id: "acc1", encrypted_webhook_secret: encryptedSecret }, shipment: null });
    const body = JSON.stringify({ shipment: { data: { reference: "unknown-ref", status: "Delivered" } } });
    const signature = createHmac("sha256", secret).update(body).digest("hex");
    const result = await handleShiipWebhook(client, { businessId, rawBody: body, signature });
    check(result.status === 200 && result.body.received === true, "valid signature, no matching shipment: 200 (acked, not retried) and no crash");
  }

  // --- Correct signature, intermediate status (picked up): updates shipment, does NOT call transitionOrderStatus ---
  {
    transitionCalls = [];
    const { client, updates } = fakeSupabase({
      account: { id: "acc1", encrypted_webhook_secret: encryptedSecret },
      shipment: { id: "ship1", order_id: "order1", status: "booked" },
    });
    const body = JSON.stringify({ shipment: { data: { reference: "ref1", status: "picked up" } } });
    const signature = createHmac("sha256", secret).update(body).digest("hex");
    const result = await handleShiipWebhook(client, { businessId, rawBody: body, signature });
    check(result.status === 200, "intermediate status: 200");
    check(updates.length === 1 && (updates[0].patch as { status: string }).status === "picked_up", "order_shipments row is updated to picked_up");
    check(transitionCalls.length === 0, "an intermediate status (picked up) does NOT call transitionOrderStatus -- orders.status has no clean slot for it");
  }

  // --- Correct signature, "Delivered": updates shipment AND calls transitionOrderStatus with actor: courier ---
  {
    transitionCalls = [];
    transitionResult = { ok: true, changed: true };
    const { client, updates } = fakeSupabase({
      account: { id: "acc1", encrypted_webhook_secret: encryptedSecret },
      shipment: { id: "ship1", order_id: "order1", status: "picked_up" },
    });
    const body = JSON.stringify({ shipment: { data: { reference: "ref1", status: "Delivered" } } });
    const signature = createHmac("sha256", secret).update(body).digest("hex");
    const result = await handleShiipWebhook(client, { businessId, rawBody: body, signature });
    check(result.status === 200, "delivered status: 200");
    check(updates.length === 1 && (updates[0].patch as { status: string }).status === "delivered", "order_shipments row is updated to delivered");
    check(transitionCalls.length === 1, "transitionOrderStatus IS called for a terminal delivered status");
    const call = transitionCalls[0] as { businessId: string; orderId: string; to: string; actor: string };
    check(call.businessId === businessId, "transitionOrderStatus called with the correct businessId (never a different one)");
    check(call.orderId === "order1", "transitionOrderStatus called with the order_id from the matched shipment row");
    check(call.to === "delivered", "transitionOrderStatus called with to: delivered");
    check(call.actor === "courier", "transitionOrderStatus called with actor: courier, not staff or customer");
  }

  // --- transitionOrderStatus fails: webhook still acks 200 (don't make Shiip retry forever over an internal Mira issue it can't fix) ---
  {
    transitionCalls = [];
    transitionResult = { ok: false, error: "something went wrong internally" };
    const { client } = fakeSupabase({
      account: { id: "acc1", encrypted_webhook_secret: encryptedSecret },
      shipment: { id: "ship1", order_id: "order1", status: "picked_up" },
    });
    const body = JSON.stringify({ shipment: { data: { reference: "ref1", status: "Delivered" } } });
    const signature = createHmac("sha256", secret).update(body).digest("hex");
    const result = await handleShiipWebhook(client, { businessId, rawBody: body, signature });
    check(result.status === 200, "transitionOrderStatus failing internally still acks the webhook 200 (logged, not surfaced as a retry-inducing error to Shiip)");
  }

  // --- Unrecognized status string: acked, not an error, nothing updated ---
  {
    transitionCalls = [];
    const { client, updates } = fakeSupabase({
      account: { id: "acc1", encrypted_webhook_secret: encryptedSecret },
      shipment: { id: "ship1", order_id: "order1", status: "booked" },
    });
    const body = JSON.stringify({ shipment: { data: { reference: "ref1", status: "some new status Shiip adds later" } } });
    const signature = createHmac("sha256", secret).update(body).digest("hex");
    const result = await handleShiipWebhook(client, { businessId, rawBody: body, signature });
    check(result.status === 200, "unrecognized status: 200 (acked)");
    check(updates.length === 0, "unrecognized status: nothing written, rather than guessing a mapping");
  }
}

void run();
