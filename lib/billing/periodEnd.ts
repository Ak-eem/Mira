const DAY_MS = 24 * 60 * 60 * 1000;

// When a paid period ends after a successful payment.
// Paying while a paid period is still running adds the new period to the END of the
// current one, so no paid days are lost. Anything else (first payment, trial, expired,
// cancelled) starts a fresh period from now. Safe against replays: the database function
// ignores a payment reference it has already applied, so this value is only used once.
export function nextPeriodEnd(input: { now: number; status: string | null; expiresAt: string | null; durationDays: number }): string {
  const current = input.expiresAt ? new Date(input.expiresAt).getTime() : NaN;
  const stillRunning = input.status === "active" && Number.isFinite(current) && current > input.now;
  const base = stillRunning ? current : input.now;
  return new Date(base + input.durationDays * DAY_MS).toISOString();
}

// Plans ending between 2 and 3 days from now get a reminder. The daily job runs once a
// day, so every plan falls in this one-day window exactly once and is warned once.
export function reminderWindow(now: number): { from: string; to: string } {
  return { from: new Date(now + 2 * DAY_MS).toISOString(), to: new Date(now + 3 * DAY_MS).toISOString() };
}
