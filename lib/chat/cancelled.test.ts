import { isCancelled, isLocked } from "../plans";
import { isBusinessSwitchedOff } from "./businessStatus";
import { getEmbedAvailability } from "../embed/availability";
import Module from "node:module";

// lib/supabase/service-role.ts imports "server-only", which deliberately throws
// outside Next.js. Stub just that guard so the real entry point can be loaded here.
type Loader = (request: string, ...rest: unknown[]) => unknown;
const moduleInternals = Module as unknown as { _load: Loader };
const originalLoad = moduleInternals._load;
moduleInternals._load = function (this: unknown, request: string, ...rest: unknown[]) {
  return request === "server-only" ? {} : originalLoad.call(this, request, ...rest);
};

function check(condition: boolean, message: string): void {
  console.log(`${condition ? "PASS" : "FAIL"} - ${message}`);
  if (!condition) process.exitCode = 1;
}

type Result = { data: unknown; error: unknown };

// Fake Supabase client: each table answers maybeSingle() with a canned result,
// and every table touched is recorded so tests can prove nothing else was read or written.
function fakeClient(tables: Record<string, Result>) {
  const touched: string[] = [];
  const client = {
    from(table: string) {
      touched.push(table);
      const result = tables[table] ?? { data: null, error: null };
      const q: Record<string, unknown> = {
        select: () => q,
        eq: () => q,
        insert: () => q,
        update: () => q,
        maybeSingle: () => Promise.resolve(result),
        single: () => Promise.resolve(result),
      };
      return q;
    },
  };
  return { client: client as never, touched };
}

const sub = (status: string) => ({ business_subscriptions: { data: { status }, error: null } });

async function run() {
  // --- isCancelled ---
  check(isCancelled({ status: "cancelled" }) === true, "isCancelled: cancelled");
  check(isCancelled({ status: "active" }) === false && isCancelled({ status: "trialing" }) === false, "isCancelled: active/trialing are not");
  check(isCancelled({ status: "past_due" }) === false, "isCancelled: past_due is locked, not cancelled");
  check(isCancelled(null) === false && isCancelled(undefined) === false, "isCancelled: no subscription row is not 'cancelled'");
  check(isLocked({ plan: "base", status: "cancelled", trial_started_at: null, trial_ends_at: null }) === true, "a cancelled subscription is also locked");

  // --- isBusinessSwitchedOff: the one rule every channel uses ---
  const DAY = 86_400_000;
  const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();
  const ahead = (days: number) => new Date(Date.now() + days * DAY).toISOString();
  const row = (fields: Record<string, unknown>) => ({
    business_subscriptions: {
      data: { owner_id: null, plan: "base", trial_started_at: null, trial_ends_at: null, expires_at: null, ...fields },
      error: null,
    },
  });
  const off = async (tables: Record<string, Result>) => isBusinessSwitchedOff(fakeClient(tables).client, "b");

  check((await off(row({ status: "cancelled" }))) === true, "switched off: cancelled");
  check((await off(row({ status: "active", expires_at: ago(1) }))) === true, "switched off: paid period has ended (status still says active)");
  check((await off(row({ status: "trialing", trial_ends_at: ago(1) }))) === true, "switched off: trial has ended");
  check((await off(row({ status: "past_due" }))) === true, "switched off: past_due");
  check((await off({ business_subscriptions: { data: null, error: null } })) === true, "switched off: no subscription row");

  check((await off(row({ status: "active", expires_at: ahead(10) }))) === false, "running: paid, period not over");
  check((await off(row({ status: "active", expires_at: null }))) === false, "running: active with no end date (manual/demo)");
  check((await off(row({ status: "trialing", trial_ends_at: ahead(5) }))) === false, "running: live trial");
  // Repaying: the same row after a payment (status active, new future end date) is live again
  // with no other step, because nothing else stores 'paused'.
  check((await off(row({ status: "active", expires_at: ahead(30) }))) === false, "repaid: a new end date in the future resumes everything");

  let threw = false;
  try {
    await off({ business_subscriptions: { data: null, error: new Error("db down") } });
  } catch {
    threw = true;
  }
  check(threw, "a database error is thrown, never guessed as 'running'");

  // --- widget availability ---
  const biz = (is_active: boolean) => ({ businesses: { data: { id: "b1", is_active }, error: null } });
  check((await getEmbedAvailability(fakeClient({ ...biz(true), ...row({ status: "active", expires_at: ahead(10) }) }).client, "x")) === true, "widget: shown for a paid, running business");
  check((await getEmbedAvailability(fakeClient({ ...biz(true), ...row({ status: "trialing", trial_ends_at: ahead(5) }) }).client, "x")) === true, "widget: shown during a live trial");
  check((await getEmbedAvailability(fakeClient({ ...biz(true), ...sub("cancelled") }).client, "x")) === false, "widget: HIDDEN for a cancelled business");
  check((await getEmbedAvailability(fakeClient({ ...biz(false), ...sub("active") }).client, "x")) === false, "widget: hidden for an inactive business");
  check((await getEmbedAvailability(fakeClient({ businesses: { data: null, error: null } }).client, "x")) === false, "widget: hidden when the slug doesn't exist");
  check((await getEmbedAvailability(fakeClient({ ...biz(true), ...sub("past_due") }).client, "x")) === false, "widget: hidden when payment is overdue (paused)");
  check(
    (await getEmbedAvailability(fakeClient({ ...biz(true), ...row({ status: "active", expires_at: ago(2) }) }).client, "x")) === false,
    "widget: HIDDEN once the paid period has ended",
  );
  check(
    (await getEmbedAvailability(fakeClient({ ...biz(true), ...row({ status: "active", expires_at: ahead(30) }) }).client, "x")) === true,
    "widget: back by itself after they pay again",
  );

  // --- WhatsApp / email entry point ---
  const { processIncomingMessage } = await import("./processIncomingMessage");
  const silentFor: Array<[string, Record<string, Result>]> = [
    ["cancelled", row({ status: "cancelled" })],
    ["paid period ended", row({ status: "active", expires_at: ago(3) })],
    ["trial ended", row({ status: "trialing", trial_ends_at: ago(3) })],
  ];
  for (const [label, tables] of silentFor) {
    const f = fakeClient(tables);
    const result = await processIncomingMessage(f.client, "b1", "wa_2348000000000", "hello?", "whatsapp", "wa:1");
    check(result.silent === true && result.reply === "" && result.messageId === null, `${label}: WhatsApp/email message gets no reply (silent)`);
    check(f.touched.length === 1 && f.touched[0] === "business_subscriptions", `${label}: nothing is read or stored besides the subscription check`);
  }

  // The email webhook's human-inbox branch (AI replies off) used to run before the
  // switched-off check, so cancelled/expired businesses still got messages stored.
  const { readFileSync } = await import("node:fs");
  // The per-email processing lives in lib/email/processQueued.ts (shared by the webhook and the admin retry).
  const route = readFileSync("lib/email/processQueued.ts", "utf8");
  const gate = route.indexOf("await isBusinessSwitchedOff(");
  const human = route.indexOf("await captureForHuman(");
  check(gate !== -1 && human !== -1 && gate < human, "email webhook: switched-off check runs before the human-inbox capture");
}

void run();
