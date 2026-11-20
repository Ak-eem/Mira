import { isRecapFresh, ORDER_RECAP_TTL_MS } from "./recapFreshness";

function check(condition: boolean, message: string): void {
  console.log(`${condition ? "PASS" : "FAIL"} - ${message}`);
  if (!condition) process.exitCode = 1;
}

const now = Date.parse("2026-11-20T12:00:00Z");
const ago = (ms: number) => new Date(now - ms).toISOString();

check(isRecapFresh(ago(60_000), now), "a one-minute-old recap is fresh");
check(isRecapFresh(ago(ORDER_RECAP_TTL_MS), now), "a recap exactly at the limit is still fresh");
check(!isRecapFresh(ago(ORDER_RECAP_TTL_MS + 1), now), "a recap one millisecond past the limit is stale");
check(!isRecapFresh(ago(3 * 24 * 60 * 60 * 1000), now), "a three-day-old recap is stale");
check(isRecapFresh(new Date(now + 5_000).toISOString(), now), "a slightly future timestamp (clock skew) is fresh");
check(!isRecapFresh(null, now) && !isRecapFresh(undefined, now) && !isRecapFresh("not a date", now), "missing or invalid timestamps are stale");
