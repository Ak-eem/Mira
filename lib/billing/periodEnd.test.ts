import { nextPeriodEnd, reminderWindow } from "./periodEnd";

function check(condition: boolean, message: string): void {
  console.log(`${condition ? "PASS" : "FAIL"} - ${message}`);
  if (!condition) process.exitCode = 1;
}
const DAY = 24 * 60 * 60 * 1000;
const now = Date.UTC(2026, 9, 24, 12, 0, 0);
const iso = (ms: number) => new Date(ms).toISOString();

check(nextPeriodEnd({ now, status: "active", expiresAt: iso(now + 10 * DAY), durationDays: 30 }) === iso(now + 40 * DAY), "paying with 10 days left gives 40 days, not 30");
check(nextPeriodEnd({ now, status: "active", expiresAt: iso(now - 2 * DAY), durationDays: 30 }) === iso(now + 30 * DAY), "an active plan that already ran out starts a fresh 30 days from now");
check(nextPeriodEnd({ now, status: "trialing", expiresAt: iso(now + 5 * DAY), durationDays: 30 }) === iso(now + 30 * DAY), "paying during a trial starts the paid period now");
check(nextPeriodEnd({ now, status: "cancelled", expiresAt: iso(now + 5 * DAY), durationDays: 30 }) === iso(now + 30 * DAY), "a cancelled plan restarts from now");
check(nextPeriodEnd({ now, status: null, expiresAt: null, durationDays: 30 }) === iso(now + 30 * DAY), "a first payment starts from now");
check(nextPeriodEnd({ now, status: "active", expiresAt: "not a date", durationDays: 30 }) === iso(now + 30 * DAY), "a corrupt stored date falls back to now instead of failing");
const w = reminderWindow(now);
check(w.from === iso(now + 2 * DAY) && w.to === iso(now + 3 * DAY), "reminder window is exactly the day that ends 2 to 3 days from now");
