// HTML date/datetime-local inputs return naive wall-clock strings with no
// timezone info ("2026-08-10", "2026-08-10T14:30"). Supabase/Postgres
// stores these into timestamptz columns by interpreting them in the DB
// session's timezone (UTC), NOT the business's own timezone. That silently
// shifts every promotion/closure boundary -- a promotion an Africa/Lagos
// admin sets to "end Friday" actually expires at 1am Friday Lagos time,
// not end of day as whoever typed it meant.
//
// These helpers convert between a naive wall-clock string (as typed into
// a form, in `timeZone`) and the correct UTC instant, and back again for
// re-populating edit forms. Same Intl-based offset trick as isOpenNow in
// lib/hours.ts, applied in both directions.

function offsetMinutesAt(utcGuessMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcGuessMs));

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asIfUTC = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return (asIfUTC - utcGuessMs) / 60_000;
}

// naive: "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm" -- exactly what <input type="date">
// and <input type="datetime-local"> produce. Returns the UTC ISO instant for
// that wall-clock moment in `timeZone`. Falls back to treating the string as
// UTC if `timeZone` isn't a recognized zone, rather than throwing -- a bad
// saved timezone shouldn't make every date field in the admin start failing.
export function zonedWallTimeToUtcISO(naive: string, timeZone: string): string {
  const [datePart, timePart] = naive.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  const [hh, mm] = (timePart ?? "00:00").split(":").map(Number);

  const utcGuess = Date.UTC(y, (m || 1) - 1, d || 1, hh || 0, mm || 0);

  try {
    const offset = offsetMinutesAt(utcGuess, timeZone);
    return new Date(utcGuess - offset * 60_000).toISOString();
  } catch {
    return new Date(utcGuess).toISOString();
  }
}

export function startOfDayUTC(dateOnly: string, timeZone: string): string {
  return zonedWallTimeToUtcISO(`${dateOnly}T00:00`, timeZone);
}

export function endOfDayUTC(dateOnly: string, timeZone: string): string {
  return zonedWallTimeToUtcISO(`${dateOnly}T23:59`, timeZone);
}

function zonedParts(iso: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { y: get("year"), m: get("month"), d: get("day"), hh: get("hour"), mm: get("minute") };
}

// Inverse of the above, for re-populating an edit form: a stored UTC
// instant -> the wall-clock date/time an admin in `timeZone` would
// recognize as what they originally typed.
export function utcToZonedWallDate(iso: string, timeZone: string): string {
  try {
    const { y, m, d } = zonedParts(iso, timeZone);
    return `${y}-${m}-${d}`;
  } catch {
    return iso.slice(0, 10);
  }
}

export function utcToZonedWallDateTime(iso: string, timeZone: string): string {
  try {
    const { y, m, d, hh, mm } = zonedParts(iso, timeZone);
    return `${y}-${m}-${d}T${hh}:${mm}`;
  } catch {
    return iso.slice(0, 16);
  }
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}
