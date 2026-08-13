export const WEEKDAY_NAMES = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];

export const WEEKDAY_SHORT_TO_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

export type HoursRow = {
  day_of_week: number;
  opens_at: string | null;
  closes_at: string | null;
};

export function formatTime(t: string | null): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

// Computes open/closed using only built-in Intl (no extra timezone
// dependency). Doesn't handle hours that cross midnight -- acceptable
// gap for MVP, flagged here rather than silently wrong.
//
// This is the single source of truth for "is it open now" -- buildContext
// (what the AI grounds its answers in), the admin hub, and the chat
// header all call through this same function, so they can never
// disagree with each other about the same fact.
export function isOpenNow(hours: HoursRow[], timezone: string): boolean | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date());

    const weekday = parts.find((p) => p.type === "weekday")?.value;
    const hour = parts.find((p) => p.type === "hour")?.value;
    const minute = parts.find((p) => p.type === "minute")?.value;
    if (!weekday || hour === undefined || minute === undefined) return null;

    const dayIndex = WEEKDAY_SHORT_TO_INDEX[weekday];
    const nowMinutes = Number(hour) * 60 + Number(minute);

    const today = hours.find((h) => h.day_of_week === dayIndex);
    if (!today || !today.opens_at || !today.closes_at) return false;

    const [openH, openM] = today.opens_at.split(":").map(Number);
    const [closeH, closeM] = today.closes_at.split(":").map(Number);
    const openMinutes = openH * 60 + openM;
    const closeMinutes = closeH * 60 + closeM;

    return nowMinutes >= openMinutes && nowMinutes < closeMinutes;
  } catch {
    return null;
  }
}
