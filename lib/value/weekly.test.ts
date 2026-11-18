import { afterHoursCount, formatMoney, summaryWindow, weeklySummaryEmail, worthSending, type WeeklyStats } from "./weekly";
import { isOpenAt, isOpenNow } from "../hours";

let failures = 0;
function check(name: string, ok: boolean) {
  if (ok) console.log(`PASS - ${name}`);
  else { failures += 1; console.error(`FAIL - ${name}`); }
}
const weekdays = [1, 2, 3, 4, 5].map((d) => ({ day_of_week: d, opens_at: "09:00:00", closes_at: "18:00:00" }));
const LAGOS = "Africa/Lagos"; // UTC+1, no DST

// --- isOpenAt (the generalisation isOpenNow now wraps) ---
check("open: Monday 10:00 Lagos", isOpenAt(weekdays, LAGOS, new Date("2026-11-09T09:00:00Z")) === true);
check("closed: Monday 19:00 Lagos", isOpenAt(weekdays, LAGOS, new Date("2026-11-09T18:00:00Z")) === false);
check("closed: a Sunday", isOpenAt(weekdays, LAGOS, new Date("2026-11-08T11:00:00Z")) === false);
check("the closing minute is closed, the opening minute is open", isOpenAt(weekdays, LAGOS, new Date("2026-11-09T17:00:00Z")) === false && isOpenAt(weekdays, LAGOS, new Date("2026-11-09T08:00:00Z")) === true);
check("no hours set: unknown, not closed", isOpenAt([], LAGOS, new Date("2026-11-09T09:00:00Z")) === null);
check("isOpenNow still answers for the present moment", isOpenNow([], LAGOS) === null && typeof isOpenNow(weekdays, LAGOS) === "boolean");

// --- chats outside opening hours ---
const chats = ["2026-11-02T09:00:00Z", "2026-11-02T20:00:00Z", "2026-11-07T10:00:00Z", "2026-11-03T04:00:00Z"]; // open, closed, Saturday, closed
check("after-hours: counts chats started while closed", afterHoursCount(chats, weekdays, LAGOS) === 3);
check("after-hours: no hours set means unknown, not zero", afterHoursCount(chats, [], LAGOS) === null);
check("after-hours: no chats with hours set is a real zero", afterHoursCount([], weekdays, LAGOS) === 0);

// --- which week, and when ---
const monday = summaryWindow(new Date("2026-11-09T08:00:00Z"), LAGOS); // Mon 9:00 Lagos
check("window: Monday morning is due, summarising the week that just ended", monday.due && monday.fromIso === "2026-11-01T23:00:00.000Z" && monday.toIso === "2026-11-08T23:00:00.000Z");
check("window: this week starts at Monday 00:00 Lagos", monday.weekStartIso === "2026-11-08T23:00:00.000Z");
check("window: a readable label", monday.label === "Mon 2 Nov to Sun 8 Nov");
check("window: still due on Tuesday and Wednesday (retry slack)", summaryWindow(new Date("2026-11-10T08:00:00Z"), LAGOS).due && summaryWindow(new Date("2026-11-11T08:00:00Z"), LAGOS).due);
check("window: the same week on Tuesday", summaryWindow(new Date("2026-11-10T08:00:00Z"), LAGOS).fromIso === monday.fromIso);
check("window: not due Thursday to Sunday", [12, 13, 14, 15].every((d) => !summaryWindow(new Date(`2026-11-${d}T08:00:00Z`), LAGOS).due));
// 23:30 UTC Sunday is already Monday 00:30 in Lagos
check("window: 'Monday' follows the business's timezone, not the server's", summaryWindow(new Date("2026-11-08T23:30:00Z"), LAGOS).due === true && summaryWindow(new Date("2026-11-08T23:30:00Z"), "UTC").due === false);
check("window: the next week moves on by exactly seven days", summaryWindow(new Date("2026-11-16T08:00:00Z"), LAGOS).fromIso === monday.toIso);
check("window: a bad timezone does not throw", typeof summaryWindow(new Date("2026-11-09T08:00:00Z"), "Not/AZone").label === "string");

// --- when to send ---
const base: WeeklyStats = { conversations: 0, repliesSent: 0, orders: 0, sales: 0, afterHours: null, waitingNow: 0 };
check("quiet week: nothing to send", !worthSending(base));
check("a chat is enough", worthSending({ ...base, conversations: 1 }));
check("an order alone is enough", worthSending({ ...base, orders: 1, sales: 2500 }));

// --- the email ---
const url = { dashboardUrl: "https://app.test/portal/b1", inboxUrl: "https://app.test/portal/b1/inbox", settingsUrl: "https://app.test/portal/b1/settings" };
const full = weeklySummaryEmail({ businessName: "Ada's Bakery", rangeLabel: "Mon 2 Nov to Sun 8 Nov", currency: "NGN", ...url, stats: { conversations: 42, repliesSent: 130, orders: 7, sales: 31500, afterHours: 12, waitingNow: 2 } });
check("email: subject names the business, chats and orders", full.subject === "Last week on Ada's Bakery: 42 chats, 7 orders");
check("email: the real numbers and money are in the text", /42 customers started a chat/.test(full.text) && /130 replies/.test(full.text) && /7 orders worth ₦31,500/.test(full.text) && /12 chats started outside your opening hours/.test(full.text));
check("email: tells them who is waiting, with a link", /2 customers are waiting for you right now: https:\/\/app\.test\/portal\/b1\/inbox/.test(full.text));
check("email: has a way to turn it off, in text and html", full.text.includes(url.settingsUrl) && full.html.includes(url.settingsUrl));
const lean = weeklySummaryEmail({ businessName: "Quiet Co", rangeLabel: "x", currency: "NGN", ...url, stats: { ...base, conversations: 1, repliesSent: 2 } });
check("email: lines with nothing to say are left out, never '0 orders'", !/order/.test(lean.text.replace("Open your dashboard", "")) && !/outside your opening hours/.test(lean.text) && !/waiting for you/.test(lean.text));
check("email: singular wording", lean.subject === "Last week on Quiet Co: 1 chat" && /1 customer started a chat/.test(lean.text));
check("email: unknown opening hours produce no after-hours line", !/outside/.test(weeklySummaryEmail({ businessName: "x", rangeLabel: "x", currency: "NGN", ...url, stats: { ...base, conversations: 3, afterHours: null } }).text));
const evil = weeklySummaryEmail({ businessName: `<img src=x onerror=alert(1)> & "Co"`, rangeLabel: "x", currency: "NGN", ...url, stats: { ...base, conversations: 1 } });
check("email: a business name cannot inject HTML", !/<img/.test(evil.html) && /&lt;img/.test(evil.html));
check("money: naira, and an unknown currency falls back", formatMoney(31500, "NGN") === "₦31,500" && formatMoney(1500, "ZZZZ") === "ZZZZ 1,500");

if (failures) { console.error(`${failures} check(s) failed`); process.exit(1); }
