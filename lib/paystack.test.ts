import { Module } from "node:module";

process.env.PAYSTACK_SECRET_KEY = "sk_test_x";

// lib/paystack.ts imports "server-only", which throws outside Next's
// bundler (it can't tell this tsx test run from a real client bundle).
// That guard exists to catch an accidental client import in the app, which
// this test is not, so it's stubbed for this process only -- the app's own
// build is unaffected.
type ModuleLoader = (request: string, ...rest: unknown[]) => unknown;
const originalLoad = (Module as unknown as { _load: ModuleLoader })._load;
(Module as unknown as { _load: ModuleLoader })._load = function patchedLoad(request, ...rest) {
  if (request === "server-only") return {};
  return originalLoad.call(Module, request, ...rest);
};

function check(condition: boolean, message: string): void {
  console.log(`${condition ? "PASS" : "FAIL"} - ${message}`);
  if (!condition) process.exitCode = 1;
}

async function runMissingEnvThrowsOnCall() {
  // Before anything else calls getPlanConfig() and populates the cache:
  // with no PAYSTACK_* vars set, importing the module must succeed, but
  // calling getPlanConfig() must still throw. This is the actual runtime
  // behavior for a misconfigured deploy -- fails on first real use, not
  // silently, and not merely by having thrown already at import time.
  delete process.env.PAYSTACK_BASE_AMOUNT_NGN;
  delete process.env.PAYSTACK_BASE_PROMO_AMOUNT_NGN;
  delete process.env.PAYSTACK_BASE_DURATION_DAYS;

  let importThrew = false;
  let mod: typeof import("./paystack") | undefined;
  try {
    mod = await import("./paystack");
  } catch {
    importThrew = true;
  }
  check(!importThrew, "importing lib/paystack.ts never throws, even with no env vars set");

  let callThrew = false;
  try {
    mod?.getPlanConfig("base", false);
  } catch {
    callThrew = true;
  }
  check(callThrew, "calling getPlanConfig() with missing env vars still throws (validation isn't skipped, just deferred)");
}

async function run() {
  process.env.PAYSTACK_BASE_AMOUNT_NGN = "5000";
  process.env.PAYSTACK_BASE_PROMO_AMOUNT_NGN = "2500";
  process.env.PAYSTACK_BASE_DURATION_DAYS = "30";

  const { getPlanConfig } = await import("./paystack");

  const full = getPlanConfig("base", false);
  check(full.amountKobo === 500000, "full price converts NGN to kobo correctly");
  check(full.durationDays === 30, "duration is read from env");

  const promo = getPlanConfig("base", true);
  check(promo.amountKobo === 250000, "promo price is distinct from full price");
  check(full.amountKobo !== promo.amountKobo, "full and promo prices never collide");

  check(getPlanConfig("base", false).amountKobo === full.amountKobo, "config is stable across calls (validated once, cached)");

  let threw = false;
  try {
    getPlanConfig("enterprise", false);
  } catch {
    threw = true;
  }
  check(threw, "an unknown plan is rejected");
}

void runMissingEnvThrowsOnCall().then(run);
