import { readFileSync } from "node:fs";
import { isLocked } from "./plans";

function check(condition: boolean, message: string): void {
  console.log(`${condition ? "PASS" : "FAIL"} - ${message}`);
  if (!condition) process.exitCode = 1;
}

function run() {
  const base = { owner_id: "x", plan: "base" as const, status: "active" as const, trial_started_at: null, trial_ends_at: null };

  check(isLocked(null) === true, "no subscription row at all: locked");
  check(isLocked({ ...base, status: "cancelled" }) === true, "cancelled status: locked regardless of expires_at");
  check(isLocked({ ...base, expires_at: "2099-01-01T00:00:00Z" }) === false, "active, not yet expired: unlocked");
  check(isLocked({ ...base, expires_at: "2020-01-01T00:00:00Z" }) === true, "active but lapsed expires_at: locked");

  // The actual bug this guards: a caller that selects columns WITHOUT
  // expires_at passes isLocked an object missing the key entirely (not
  // `expires_at: null`, which would be a deliberately never-expiring plan --
  // the key is just absent). isLocked treats an absent key the same as
  // null, so it can never tell "no expiry" from "forgot to select it".
  // That ambiguity is exactly why five chat routes stayed unlocked past
  // their paid period's end date: they selected owner_id, plan, status,
  // trial_started_at, trial_ends_at -- never expires_at.
  const missingExpiresAtKey = { ...base } as typeof base & { expires_at?: string | null };
  delete missingExpiresAtKey.expires_at;
  check(
    isLocked(missingExpiresAtKey) === false,
    "documents the trap: omitting expires_at from a select reads as never-expires, not as expired -- callers MUST select it",
  );

  // Static guard: every route that calls isLocked on a business_subscriptions
  // row must select expires_at, or it silently falls into the trap above.
  // This is the actual bug (the select, not isLocked itself), so the
  // regression test is on the route files, not just the helper.
  const routesThatCheckIsLocked = [
    "app/api/chat/route.ts",
    "app/api/chat/messages/route.ts",
    "app/api/chat/end/route.ts",
    "app/api/chat/rate/route.ts",
    "app/api/chat/orders/delivered/route.ts",
  ];
  for (const path of routesThatCheckIsLocked) {
    const source = readFileSync(path, "utf8");
    const usesIsLocked = /\bisLocked\s*\(/.test(source);
    const selectsExpiresAt = /\.select\(\s*["'][^"']*\bexpires_at\b[^"']*["']\s*\)/.test(source);
    check(usesIsLocked, `${path}: still calls isLocked (update this test's route list if that changed)`);
    check(selectsExpiresAt, `${path}: selects expires_at before calling isLocked`);
  }
}

run();
