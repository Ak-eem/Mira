import { describeSubscriptionChange } from "./activitySummaries";
let failures = 0;
function check(label: string, pass: boolean) { if (!pass) { failures++; console.error(`FAIL: ${label}`); } else console.log(`ok: ${label}`); }
const base = { plan: "base", status: "active", nudges_addon: false, nudges_tier: null, max_nudges_per_customer_per_week: 2 };

check("plan change names both plans", describeSubscriptionChange(base, { ...base, plan: "pro" }) === "Plan Base \u2192 Pro");
check("status change", describeSubscriptionChange(base, { ...base, status: "cancelled" }) === "Status active \u2192 cancelled");
check("several changes are joined", describeSubscriptionChange(base, { ...base, plan: "pro", status: "past_due" }) === "Plan Base \u2192 Pro \u00b7 Status active \u2192 past_due");
check("add-on switched on shows the tier", describeSubscriptionChange(base, { ...base, nudges_addon: true, nudges_tier: "plus" }) === "Nudges add-on off \u2192 on (plus)");
check("changing only the tier is reported", describeSubscriptionChange({ ...base, nudges_addon: true, nudges_tier: "basic" }, { ...base, nudges_addon: true, nudges_tier: "plus" }) === "Nudges add-on on (basic) \u2192 on (plus)");
check("weekly cap change", describeSubscriptionChange(base, { ...base, max_nudges_per_customer_per_week: 5 }) === "Max nudges per customer per week 2 \u2192 5");
check("no change says so", describeSubscriptionChange(base, { ...base }) === "Subscription saved, nothing changed");
check("a first-time subscription is described", describeSubscriptionChange(null, base) === "Subscription created: Base plan, active");
if (failures) { console.error(`${failures} check(s) failed`); process.exit(1); }
