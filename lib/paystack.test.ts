import { Module } from "node:module";

process.env.PAYSTACK_SECRET_KEY = "sk_test_x";
process.env.PAYSTACK_BASE_AMOUNT_NGN = "5000";
process.env.PAYSTACK_BASE_PROMO_AMOUNT_NGN = "2500";
process.env.PAYSTACK_BASE_DURATION_DAYS = "30";

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

async function run() {
  const { getPlanConfig } = await import("./paystack");

  const full = getPlanConfig("base", false);
  check(full.amountKobo === 500000, "full price converts NGN to kobo correctly");
  check(full.durationDays === 30, "duration is read from env");

  const promo = getPlanConfig("base", true);
  check(promo.amountKobo === 250000, "promo price is distinct from full price");
  check(full.amountKobo !== promo.amountKobo, "full and promo prices never collide");

  check(getPlanConfig("base", false).amountKobo === full.amountKobo, "config is stable across repeated calls (read once at module load)");

  let threw = false;
  try {
    getPlanConfig("enterprise", false);
  } catch {
    threw = true;
  }
  check(threw, "an unknown plan is rejected");
}

void run();
