import { countSubscriptions } from "./subscriptionCounts";
let failures = 0;
function check(label: string, pass: boolean) { if (!pass) { failures++; console.error(`FAIL: ${label}`); } else console.log(`ok: ${label}`); }
const day = 86_400_000;
const iso = (offset: number) => new Date(Date.now() + offset * day).toISOString();
const sub = (status: string, trial: number | null, expires: number | null) => ({ status, trial_ends_at: trial === null ? null : iso(trial), expires_at: expires === null ? null : iso(expires) }) as never;

const c = countSubscriptions([
  sub("trialing", 5, null), sub("trialing", 1, null),          // two live trials
  sub("trialing", -3, null), sub("trialing", -30, null),        // two ended trials (were counted as "on trial")
  sub("active", null, 20), sub("active", null, null),           // two paid
  sub("active", null, -2),                                      // paid but lapsed
  sub("past_due", null, null), sub("cancelled", null, null),    // past due / cancelled
]);
check("only unexpired trials count as on trial", c.onTrial === 2);
check("paid and in date counts as active", c.active === 2);
check("ended trials, lapsed, past-due and cancelled need payment", c.needsPayment === 5);
check("nothing is double counted", c.onTrial + c.active + c.needsPayment === 9);
check("an empty list is all zeros", JSON.stringify(countSubscriptions([])) === JSON.stringify({ onTrial: 0, active: 0, needsPayment: 0 }));
if (failures) { console.error(`${failures} check(s) failed`); process.exit(1); }
