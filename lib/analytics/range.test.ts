import { readFileSync } from "node:fs";
import { bucketLabel, getAnalyticsRange, parseAnalyticsRange } from "./queries";
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

// ---- days are counted on the business's calendar, not the server's ----
// 23:30 UTC on Sunday 1 Nov is already 00:30 on Monday 2 Nov in Lagos (UTC+1).
const justAfterLagosMidnight = new Date("2026-11-01T23:30:00Z");
const iso = (d: Date) => d.toISOString();
const today = getAnalyticsRange("today", "Africa/Lagos", justAfterLagosMidnight);
check("'today' starts at Lagos midnight (23:00 UTC the evening before), not at UTC midnight", iso(today.from) === "2026-11-01T23:00:00.000Z");
check("'today' ends at now", iso(today.to) === "2026-11-01T23:30:00.000Z");
const week = getAnalyticsRange("7d", "Africa/Lagos", justAfterLagosMidnight);
check("'7d' is seven whole local days ending today (starts Tue 27 Oct, Lagos midnight)", iso(week.from) === "2026-10-26T23:00:00.000Z");
const month = getAnalyticsRange("month", "Africa/Lagos", justAfterLagosMidnight);
check("'month' starts at midnight on the 1st in Lagos, so the first hour of the month is not lost", iso(month.from) === "2026-10-31T23:00:00.000Z");
check("'30d' is thirty whole local days", iso(getAnalyticsRange("30d", "Africa/Lagos", justAfterLagosMidnight).from) === "2026-10-03T23:00:00.000Z");
const all = getAnalyticsRange("all", "Africa/Lagos", justAfterLagosMidnight);
check("'all' is unchanged: from 2000 to now", iso(all.from) === "2000-01-01T00:00:00.000Z" && iso(all.to) === "2026-11-01T23:30:00.000Z");
check("with no timezone given, the platform default (Africa/Lagos) is used", iso(getAnalyticsRange("today", undefined, justAfterLagosMidnight).from) === "2026-11-01T23:00:00.000Z");
check("a different timezone gives its own day: it is still Sunday 1 Nov in New York, whose day began at 04:00 UTC", iso(getAnalyticsRange("today", "America/New_York", justAfterLagosMidnight).from) === "2026-11-01T04:00:00.000Z");
check("'month' is not 'today' and not 'all'", month.from < today.from && month.from > all.from);

// A conversation that started at 23:30 UTC belongs to Monday 2 Nov for a Lagos business, Sunday 1 Nov for UTC.
const sent = "2026-11-01T23:30:00Z";
const lagosLabel = bucketLabel(sent, "7d", "Africa/Lagos");
const utcLabel = bucketLabel(sent, "7d", "UTC");
check("day bars use the business's day: the same instant is Nov 2 in Lagos and Nov 1 in UTC", /\b2\b/.test(lagosLabel) && /\b1\b/.test(utcLabel) && lagosLabel !== utcLabel);
check("monthly bars use the business's month too: 23:30 UTC on 30 Nov is already December in Lagos", bucketLabel("2026-11-30T23:30:00Z", "all", "Africa/Lagos") !== bucketLabel("2026-11-30T23:30:00Z", "all", "UTC"));

// ---- nothing left on the server's clock ----
const source = readFileSync("lib/analytics/queries.ts", "utf8");
check("queries.ts no longer builds ranges from the server clock (setHours / setDate)", !/\.setHours\(|\.setDate\(/.test(source));
check("every date label in queries.ts names a timezone", ![...source.matchAll(/toLocaleDateString\(undefined, \{[^}]*\}/g)].some((m) => !/timeZone/.test(m[0])));
check("the snapshot reports which timezone it used", /timeZone,\n\s+from: fromIso/.test(source));
if (failures) { console.error(`${failures} check(s) failed`); process.exit(1); }
