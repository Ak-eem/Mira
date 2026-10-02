import { isLocked, isPaidActive, type BusinessSubscription } from "./plans";

function check(condition: boolean, message: string): void {
  console.log(`${condition ? "PASS" : "FAIL"} - ${message}`);
  if (!condition) process.exitCode = 1;
}

const DAY = 86_400_000;
const base = { plan: "base", trial_started_at: null, trial_ends_at: null } as const;
const sub = (over: Partial<BusinessSubscription>): BusinessSubscription => ({ ...base, status: "active", ...over });

check(isLocked(null), "no subscription row is locked");
check(!isLocked(sub({ expires_at: new Date(Date.now() + DAY).toISOString() })), "active and paid through tomorrow is unlocked");
check(isLocked(sub({ expires_at: new Date(Date.now() - DAY).toISOString() })), "active but expired yesterday is locked");
check(!isLocked(sub({ expires_at: null })), "active with no expiry (manual grant) is unlocked");
check(!isLocked(sub({})), "active with expires_at undefined (older callers) is unlocked");
check(isLocked(sub({ status: "cancelled", expires_at: new Date(Date.now() + DAY).toISOString() })), "cancelled is locked even with a future expiry");
check(
  !isLocked(sub({ status: "trialing", trial_started_at: new Date().toISOString(), trial_ends_at: new Date(Date.now() + DAY).toISOString() })),
  "unexpired trial is unlocked",
);
check(
  isLocked(sub({ status: "trialing", trial_started_at: new Date().toISOString(), trial_ends_at: new Date(Date.now() - DAY).toISOString() })),
  "expired trial is locked",
);
check(!isPaidActive(sub({ expires_at: "not-a-date" })), "an unparseable expiry is treated as expired");
