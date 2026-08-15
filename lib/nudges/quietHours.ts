// "No sends before 9am or after 9pm business-local time" (Nudges spec).
// Same Intl-based approach as isOpenNow in lib/hours.ts: ask the runtime
// what hour it is *in that timezone* right now, rather than doing our
// own UTC-offset arithmetic (which breaks across DST boundaries where
// they apply).
export function isWithinQuietHours(timeZone: string, now: Date = new Date()): boolean {
  try {
    const hour = Number(
      new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(now),
    );
    return hour < 9 || hour >= 21;
  } catch {
    // Unrecognized timezone -- fail toward NOT sending rather than
    // risking a 3am message because a business's saved timezone string
    // is bad.
    return true;
  }
}
