import type { ChartPoint } from "@/app/portal/(protected)/[businessId]/ActivityChart";

export const DAY_MS = 24 * 60 * 60 * 1000;
const TZ = "Africa/Lagos";
const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);

// PostgREST returns at most 1000 rows per request, so page through (capped at maxRows)
// rather than silently under-counting a busy period.
export async function fetchPaged<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null }>, maxRows = 5000): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < maxRows; from += 1000) {
    const { data } = await page(from, from + 999);
    if (!data) break;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows;
}

// One point per day for the last CHART_DAYS days (the 90 shown plus the 90 before, for comparing),
// zero-filled so quiet days still show. `channel` splits a day into parts.
export const CHART_DAYS = 180;
export function dailySeries(now: number, entries: { at: string; value: number; channel?: string }[]): ChartPoint[] {
  const days = new Map<string, { value: number; parts: Record<string, number> }>();
  for (const entry of entries) {
    const key = dayKey(new Date(entry.at));
    const day = days.get(key) ?? { value: 0, parts: {} };
    day.value += entry.value;
    if (entry.channel) day.parts[entry.channel] = (day.parts[entry.channel] ?? 0) + entry.value;
    days.set(key, day);
  }
  return Array.from({ length: CHART_DAYS }, (_, i) => {
    const date = new Date(now - (CHART_DAYS - 1 - i) * DAY_MS);
    const day = days.get(dayKey(date));
    return { t: date.getTime(), value: day?.value ?? 0, ...(day ? { parts: day.parts } : {}) };
  });
}
