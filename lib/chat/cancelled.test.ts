import { isCancelled, isLocked } from "../plans";
import { isBusinessCancelled } from "./businessStatus";
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

  // --- isBusinessCancelled ---
  check((await isBusinessCancelled(fakeClient(sub("cancelled")).client, "b")) === true, "isBusinessCancelled: true for cancelled");
  check((await isBusinessCancelled(fakeClient(sub("active")).client, "b")) === false, "isBusinessCancelled: false for active");
  let threw = false;
  try {
    await isBusinessCancelled(fakeClient({ business_subscriptions: { data: null, error: new Error("db down") } }).client, "b");
  } catch {
    threw = true;
  }
  check(threw, "isBusinessCancelled: a database error is thrown, never guessed as 'not cancelled'");

  // --- widget availability ---
  const biz = (is_active: boolean) => ({ businesses: { data: { id: "b1", is_active }, error: null } });
  check((await getEmbedAvailability(fakeClient({ ...biz(true), ...sub("active") }).client, "x")) === true, "widget: shown for an active business");
  check((await getEmbedAvailability(fakeClient({ ...biz(true), ...sub("trialing") }).client, "x")) === true, "widget: shown during a trial");
  check((await getEmbedAvailability(fakeClient({ ...biz(true), ...sub("cancelled") }).client, "x")) === false, "widget: HIDDEN for a cancelled business");
  check((await getEmbedAvailability(fakeClient({ ...biz(false), ...sub("active") }).client, "x")) === false, "widget: hidden for an inactive business");
  check((await getEmbedAvailability(fakeClient({ businesses: { data: null, error: null } }).client, "x")) === false, "widget: hidden when the slug doesn't exist");
  check((await getEmbedAvailability(fakeClient({ ...biz(true), ...sub("past_due") }).client, "x")) === true, "widget: a merely unpaid business keeps its 'unavailable' message instead of vanishing");

  // --- WhatsApp / email entry point ---
  const { processIncomingMessage } = await import("./processIncomingMessage");
  const cancelled = fakeClient(sub("cancelled"));
  const result = await processIncomingMessage(cancelled.client, "b1", "wa_2348000000000", "hello?", "whatsapp", "wa:1");
  check(result.silent === true && result.reply === "" && result.messageId === null, "cancelled business: WhatsApp/email message gets no reply (silent)");
  check(
    cancelled.touched.length === 1 && cancelled.touched[0] === "business_subscriptions",
    "cancelled business: nothing is read or stored besides the subscription check",
  );
}

void run();
