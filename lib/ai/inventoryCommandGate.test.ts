// Run with `npx tsx lib/ai/inventoryCommandGate.test.ts`.
import { readFileSync } from "node:fs";
import Module from "node:module";

// lib/supabase/service-role.ts imports "server-only", which throws outside Next.js (same stub as cancelled.test.ts).
type Loader = (request: string, ...rest: unknown[]) => unknown;
const moduleInternals = Module as unknown as { _load: Loader };
const originalLoad = moduleInternals._load;
moduleInternals._load = function (this: unknown, request: string, ...rest: unknown[]) {
  return request === "server-only" ? {} : originalLoad.call(this, request, ...rest);
};

function check(label: string, pass: boolean) {
  console.log(`${pass ? "PASS" : "FAIL"} — ${label}`);
  if (!pass) process.exitCode = 1;
}

async function main() {
  const { checkInventoryAssistantAllowed, INVENTORY_COMMANDS_PER_HOUR } = await import("./inventoryCommandGate");
  type Deps = NonNullable<Parameters<typeof checkInventoryAssistantAllowed>[1]>;

  const events: string[] = [];
  const service = { marker: "service-role" };
  const deps = (over: { off?: boolean | "throws"; allowed?: boolean; limiterDown?: boolean; limiterThrows?: boolean } = {}): Deps => ({
    serviceClient: (() => service) as unknown as Deps["serviceClient"],
    isSwitchedOff: (async (client: unknown) => {
      events.push(client === service ? "status(service)" : "status(other)");
      if (over.off === "throws") throw new Error("db down");
      return over.off === true;
    }) as Deps["isSwitchedOff"],
    rateLimit: (async (_client: unknown, key: string, limit: number, window: number) => {
      events.push(`limit:${key}:${limit}:${window}`);
      if (over.limiterThrows) throw new Error("rpc down");
      return over.allowed === false ? { allowed: false, retryAfterSeconds: 30, error: over.limiterDown ? "unavailable" : undefined } : { allowed: true };
    }) as Deps["rateLimit"],
  });
  const run = (d: Deps) => { events.length = 0; return checkInventoryAssistantAllowed("biz-1", d); };
  const quiet = console.error;
  console.error = () => {};

  const ok = await run(deps());
  check("a switched-on business under its limit is allowed", ok.ok === true);
  check("the status check and the limit use the service-role client, in that order", events.join() === `status(service),limit:inventory-command:biz-1:${INVENTORY_COMMANDS_PER_HOUR}:3600`);
  check("the limit is per business, per hour, and generous (60)", INVENTORY_COMMANDS_PER_HOUR === 60);

  const off = await run(deps({ off: true }));
  check("a switched-off business is refused with a clear message", !off.ok && /switched off/.test(off.message) && /edit your products yourself/.test(off.message));
  check("a switched-off business uses no rate-limit budget", events.join() === "status(service)");

  const unreadable = await run(deps({ off: "throws" }));
  check("if the plan status can't be read it refuses with a try-again, not an error", !unreadable.ok && /try again/.test(unreadable.message) && events.join() === "status(service)");

  const limited = await run(deps({ allowed: false }));
  check("over the hourly limit: refused, and tells the owner they can edit directly", !limited.ok && /lot of commands/.test(limited.message) && /edit your products directly/.test(limited.message));
  const limiterDown = await run(deps({ allowed: false, limiterDown: true }));
  check("rate limiter unavailable: refused (fails closed) with a try-again", !limiterDown.ok && /unavailable/.test(limiterDown.message));
  const limiterThrows = await run(deps({ limiterThrows: true }));
  check("rate limiter throwing: refused, not a crash", !limiterThrows.ok);
  console.error = quiet;

  // The action: the gate must run before any AI work, and applying a confirmed change must stay ungated.
  const actions = readFileSync("app/portal/(protected)/[businessId]/inventory/actions.ts", "utf8");
  const gate = actions.indexOf("checkInventoryAssistantAllowed(businessId)");
  check("the action calls the gate", gate > 0);
  check("the gate runs after the owner check and before any AI work", gate > actions.indexOf("requireOwner(businessId)") && gate < actions.indexOf("await parseCommand(") && gate < actions.indexOf("await buildBusinessContext("));
  const applyStart = actions.indexOf("export async function", gate);
  check("only interpreting a command is gated; applying a confirmed change (no AI call) is not", applyStart > 0 && !/checkInventoryAssistantAllowed/.test(actions.slice(applyStart)));
  check("the gate module is not a 'use server' file (those may only export async functions)", !/^"use server"/m.test(readFileSync("lib/ai/inventoryCommandGate.ts", "utf8")));
}

main().catch((error) => {
  console.error("FAIL — inventory gate tests crashed:", error);
  process.exitCode = 1;
});
