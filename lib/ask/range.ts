// Turns "last week" / "this month" / an explicit pair of dates into the two UTC instants a query needs,
// computed on the BUSINESS's calendar (its own timezone, weeks starting Monday), never the server's.
//
// Why this exists: lib/analytics's getRange uses the server's clock (setHours/setDate), so for a Lagos
// business on a UTC server, a message sent at 00:30 Monday Lagos time counts as Sunday. Here the model
// never does any date arithmetic: it names a preset or gives local dates, and this resolves them.
import { endOfDayUTC, isValidTimeZone, startOfDayUTC, utcToZonedWallDate } from "@/lib/timezone";

export const DEFAULT_TIME_ZONE = "Africa/Lagos";

export const RANGE_PRESETS = ["today", "yesterday", "this_week", "last_week", "this_month", "last_month", "last_7_days", "last_30_days"] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

export type RangeSpec = { preset?: unknown; from?: unknown; to?: unknown };

export type ResolvedRange = {
  /** Inclusive UTC instants to query with. */
  fromIso: string;
  toIso: string;
  /** The same range as business-local calendar dates (inclusive). */
  fromDate: string;
  toDate: string;
  timeZone: string;
  /** True when the range runs up to "now", so the last day is not over yet. */
  includesToday: boolean;
  /** Calendar days covered, for answers like "over 7 days". */
  days: number;
  /** Human-readable, e.g. "Mon 26 Oct – Sun 1 Nov 2026 (Africa/Lagos)". */
  label: string;
};

export const MAX_RANGE_DAYS = 366;

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function safeTimeZone(timeZone: unknown): string {
  return typeof timeZone === "string" && timeZone.trim() !== "" && isValidTimeZone(timeZone.trim()) ? timeZone.trim() : DEFAULT_TIME_ZONE;
}

// ---- calendar arithmetic on "YYYY-MM-DD" strings (no timezone involved, so no DST surprises) ----
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDate(value: string): Date | null {
  const match = DATE_RE.exec(value);
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(y, m - 1, d));
  // Reject 2026-02-31 and friends: the round trip must give the same fields back.
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? date : null;
}

function formatDate(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function addDays(dateOnly: string, days: number): string {
  const date = parseDate(dateOnly) as Date;
  date.setUTCDate(date.getUTCDate() + days);
  return formatDate(date);
}

function mondayOf(dateOnly: string): string {
  const day = (parseDate(dateOnly) as Date).getUTCDay(); // 0 = Sunday
  return addDays(dateOnly, -((day + 6) % 7));
}

function firstOfMonth(dateOnly: string): string {
  return `${dateOnly.slice(0, 8)}01`;
}

function daysBetween(from: string, to: string): number {
  return Math.round(((parseDate(to) as Date).getTime() - (parseDate(from) as Date).getTime()) / 86_400_000);
}

function describeDate(dateOnly: string, withYear: boolean): string {
  const date = parseDate(dateOnly) as Date;
  return `${DAY_NAMES[date.getUTCDay()]} ${date.getUTCDate()} ${MONTH_NAMES[date.getUTCMonth()]}${withYear ? ` ${date.getUTCFullYear()}` : ""}`;
}

export function datesInRange(fromDate: string, toDate: string): string[] {
  const dates: string[] = [];
  for (let cursor = fromDate; cursor <= toDate && dates.length <= MAX_RANGE_DAYS; cursor = addDays(cursor, 1)) dates.push(cursor);
  return dates;
}

export function todayInZone(now: Date, timeZone: string): string {
  return utcToZonedWallDate(now.toISOString(), timeZone);
}

export type RangeResult = { ok: true; range: ResolvedRange } | { ok: false; error: string };

export function resolveBusinessRange(spec: RangeSpec, timeZoneInput: unknown, now: Date = new Date()): RangeResult {
  const timeZone = safeTimeZone(timeZoneInput);
  const today = todayInZone(now, timeZone);

  let fromDate: string;
  let toDate: string;

  if (typeof spec.preset === "string" && spec.preset !== "") {
    switch (spec.preset as RangePreset) {
      case "today":
        [fromDate, toDate] = [today, today];
        break;
      case "yesterday":
        [fromDate, toDate] = [addDays(today, -1), addDays(today, -1)];
        break;
      case "this_week":
        [fromDate, toDate] = [mondayOf(today), today];
        break;
      case "last_week": {
        const thisMonday = mondayOf(today);
        [fromDate, toDate] = [addDays(thisMonday, -7), addDays(thisMonday, -1)];
        break;
      }
      case "this_month":
        [fromDate, toDate] = [firstOfMonth(today), today];
        break;
      case "last_month": {
        const lastDayOfPrev = addDays(firstOfMonth(today), -1);
        [fromDate, toDate] = [firstOfMonth(lastDayOfPrev), lastDayOfPrev];
        break;
      }
      case "last_7_days":
        [fromDate, toDate] = [addDays(today, -6), today];
        break;
      case "last_30_days":
        [fromDate, toDate] = [addDays(today, -29), today];
        break;
      default:
        return { ok: false, error: `Unknown preset "${spec.preset}". Use one of: ${RANGE_PRESETS.join(", ")}, or give from and to dates.` };
    }
  } else if (typeof spec.from === "string" && typeof spec.to === "string") {
    if (!parseDate(spec.from) || !parseDate(spec.to)) return { ok: false, error: "from and to must be real calendar dates written YYYY-MM-DD." };
    if (spec.from > spec.to) return { ok: false, error: "from must not be after to." };
    if (spec.from > today) return { ok: false, error: `That period has not started yet (today is ${today} for this business).` };
    fromDate = spec.from;
    toDate = spec.to > today ? today : spec.to; // nothing exists in the future; clamp, and the label says so
  } else {
    return { ok: false, error: "Give a preset (for example last_week) or both from and to dates (YYYY-MM-DD)." };
  }

  if (daysBetween(fromDate, toDate) + 1 > MAX_RANGE_DAYS) return { ok: false, error: `That range is longer than ${MAX_RANGE_DAYS} days. Ask for a shorter period.` };

  const includesToday = toDate === today;
  const fromIso = startOfDayUTC(fromDate, timeZone);
  // Up to now, not to the end of a day that has not finished.
  const toIso = includesToday ? now.toISOString() : endOfDayUTC(toDate, timeZone);

  const sameDay = fromDate === toDate;
  const label = sameDay
    ? `${describeDate(fromDate, true)} (${timeZone})`
    : `${describeDate(fromDate, fromDate.slice(0, 4) !== toDate.slice(0, 4))} – ${describeDate(toDate, true)} (${timeZone})`;

  return { ok: true, range: { fromIso, toIso, fromDate, toDate, timeZone, includesToday, days: daysBetween(fromDate, toDate) + 1, label } };
}
