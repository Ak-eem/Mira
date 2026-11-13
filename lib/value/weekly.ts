import { todayInZone } from "@/lib/ask/range";
import { WEEKDAY_SHORT_TO_INDEX, isOpenAt, type HoursRow } from "@/lib/hours";
import { startOfDayUTC } from "@/lib/timezone";

// The Monday summary email: what Mira did for the business last week, in real numbers from its own data.
// Everything here is pure (no database, no clock of its own) so it can be tested exactly.

export type WeeklyStats = {
  conversations: number; // customers who started a chat
  repliesSent: number; // messages Mira sent
  orders: number; // orders placed, shipped or delivered
  sales: number; // their total value
  afterHours: number | null; // chats started outside opening hours (null: no hours set, so unknown)
  waitingNow: number; // customers waiting for a person right now
};

// Quiet weeks get no email: "0 chats" is discouraging and tells the owner nothing.
export function worthSending(stats: WeeklyStats): boolean {
  return stats.conversations > 0 || stats.orders > 0;
}

export function afterHoursCount(startedAt: string[], hours: HoursRow[], timezone: string): number | null {
  let known = false;
  let count = 0;
  for (const iso of startedAt) {
    const open = isOpenAt(hours, timezone, new Date(iso));
    if (open === null) return null;
    known = true;
    if (open === false) count += 1;
  }
  return known || hours.some((h) => h.opens_at && h.closes_at) ? count : null;
}

const DAY_MS = 86_400_000;
function addDays(dateOnly: string, days: number): string {
  const [y, m, d] = dateOnly.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * DAY_MS).toISOString().slice(0, 10);
}

export type SummaryWindow = {
  /** Mon to Wed (in the business's own timezone): the summary for the week that just ended may go out. */
  due: boolean;
  /** This week's Monday 00:00 as a UTC instant. A summary sent before this belongs to an earlier week. */
  weekStartIso: string;
  /** The week being summarised: last Monday 00:00 up to (not including) this Monday 00:00. */
  fromIso: string;
  toIso: string;
  label: string;
};

// Sent from a daily job, so it has three days (Mon to Wed) to go out if a run fails, and the claim in the
// database keeps it to one send per week.
export function summaryWindow(now: Date, timezone: string): SummaryWindow {
  const today = todayInZone(now, timezone);
  let weekday: number;
  try {
    weekday = WEEKDAY_SHORT_TO_INDEX[new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" }).format(now)];
  } catch {
    weekday = 1;
  }
  const sinceMonday = (weekday + 6) % 7;
  const thisMonday = addDays(today, -sinceMonday);
  const lastMonday = addDays(thisMonday, -7);
  const lastSunday = addDays(thisMonday, -1);
  const fmt = (dateOnly: string) =>
    new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }).format(new Date(`${dateOnly}T12:00:00Z`));
  return {
    due: sinceMonday <= 2,
    weekStartIso: startOfDayUTC(thisMonday, timezone),
    fromIso: startOfDayUTC(lastMonday, timezone),
    toIso: startOfDayUTC(thisMonday, timezone),
    label: `${fmt(lastMonday)} to ${fmt(lastSunday)}`,
  };
}

export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-NG", { style: "currency", currency, minimumFractionDigits: Number.isInteger(amount) ? 0 : 2, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString("en-US")}`;
  }
}

const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

export function weeklySummaryEmail(input: {
  businessName: string;
  rangeLabel: string;
  stats: WeeklyStats;
  currency: string;
  dashboardUrl: string;
  inboxUrl: string;
  settingsUrl: string;
}): { subject: string; text: string; html: string } {
  const { stats } = input;
  const lines: { text: string; html: string }[] = [];
  lines.push({ text: `${plural(stats.conversations, "customer", "customers")} started a chat`, html: `<b>${plural(stats.conversations, "customer", "customers")}</b> started a chat` });
  if (stats.repliesSent > 0) lines.push({ text: `Mira sent ${plural(stats.repliesSent, "reply", "replies")}`, html: `Mira sent <b>${plural(stats.repliesSent, "reply", "replies")}</b>` });
  if (stats.orders > 0) {
    const money = formatMoney(stats.sales, input.currency);
    lines.push({ text: `${plural(stats.orders, "order", "orders")} worth ${money}`, html: `<b>${plural(stats.orders, "order", "orders")}</b> worth <b>${esc(money)}</b>` });
  }
  if (stats.afterHours !== null && stats.afterHours > 0) {
    lines.push({ text: `${plural(stats.afterHours, "chat", "chats")} started outside your opening hours`, html: `<b>${plural(stats.afterHours, "chat", "chats")}</b> started outside your opening hours` });
  }
  const waiting =
    stats.waitingNow > 0
      ? { text: `${plural(stats.waitingNow, "customer is", "customers are")} waiting for you right now: ${input.inboxUrl}`, html: `<p><b>${plural(stats.waitingNow, "customer is", "customers are")} waiting for you right now.</b> <a href="${esc(input.inboxUrl)}">Open your inbox</a></p>` }
      : null;
  const orderPart = stats.orders > 0 ? `, ${plural(stats.orders, "order", "orders")}` : "";
  const subject = `Last week on ${input.businessName}: ${plural(stats.conversations, "chat", "chats")}${orderPart}`;
  const text = [
    `Here is what Mira did for ${input.businessName} last week (${input.rangeLabel}).`,
    "",
    ...lines.map((l) => `- ${l.text}`),
    ...(waiting ? ["", waiting.text] : []),
    "",
    `Open your dashboard: ${input.dashboardUrl}`,
    "",
    `You get this every Monday. Turn it off in Settings: ${input.settingsUrl}`,
  ].join("\n");
  const html = `<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:520px;color:#0f2a22">
<p>Here is what Mira did for <b>${esc(input.businessName)}</b> last week (${esc(input.rangeLabel)}).</p>
<ul style="padding-left:18px;line-height:1.7">${lines.map((l) => `<li>${l.html}</li>`).join("")}</ul>
${waiting ? waiting.html : ""}
<p><a href="${esc(input.dashboardUrl)}">Open your dashboard</a></p>
<p style="color:#6b7a74;font-size:12px">You get this every Monday. <a href="${esc(input.settingsUrl)}" style="color:#6b7a74">Turn it off in Settings</a>.</p>
</div>`;
  return { subject, text, html };
}
