import { bucketLabel, parseAnalyticsRange } from "./queries";
let failures = 0;
function check(label: string, pass: boolean) { if (!pass) { failures++; console.error(`FAIL: ${label}`); } else console.log(`ok: ${label}`); }

check("'all' is a valid range", parseAnalyticsRange("all") === "all");
check("the existing ranges still parse", ["today", "7d", "30d", "month"].every((r) => parseAnalyticsRange(r) === r));
check("an unknown value falls back to 7d", parseAnalyticsRange("forever") === "7d" && parseAnalyticsRange(undefined) === "7d");
const a = "2026-10-11T10:00:00Z", b = "2026-10-25T10:00:00Z", c = "2026-11-02T10:00:00Z";
check("normal ranges bucket by day", bucketLabel(a, "7d") !== bucketLabel(b, "7d"));
check("'all' buckets by month: same month, same bar", bucketLabel(a, "all") === bucketLabel(b, "all"));
check("'all': different months, different bars", bucketLabel(a, "all") !== bucketLabel(c, "all"));
check("'all' labels carry the year", /2026/.test(bucketLabel(a, "all")));
if (failures) { console.error(`${failures} check(s) failed`); process.exit(1); }
