// Turns a Supabase/Postgres/fetch error into something an admin can act on: what happened, the code,
// and what to try. Pure, so it is unit-tested and usable from server and client components.

export type ErrorInfo = { message: string; code: string | null; details: string | null; hint: string; };

type Raw = { message?: unknown; code?: unknown; details?: unknown; hint?: unknown } | null | undefined;

const BY_CODE: Record<string, string> = {
  "42501": "Permission denied. Your session may not be a platform admin, or a row-level-security policy blocked this query.",
  "42P01": "A table is missing. A database migration has probably not been applied yet.",
  "42703": "A column is missing. A database migration has probably not been applied yet.",
  "42883": "A database function is missing. A migration has probably not been applied yet.",
  PGRST301: "Your sign-in has expired. Sign out and back in.",
  PGRST116: "The record was not found, or is not visible to your account.",
  "23505": "That record already exists.",
  "23503": "This is linked to another record that no longer exists.",
  "57014": "The query took too long and was cancelled. Try again, or narrow the date range.",
};

export function describeError(error: Raw | unknown): ErrorInfo {
  const raw = (typeof error === "object" && error !== null ? error : { message: String(error ?? "") }) as Record<string, unknown>;
  const message = typeof raw.message === "string" && raw.message.trim() ? raw.message.trim() : "Unknown error";
  const code = typeof raw.code === "string" && raw.code ? raw.code : null;
  const details = typeof raw.details === "string" && raw.details ? raw.details : null;
  const dbHint = typeof raw.hint === "string" && raw.hint ? raw.hint : null;

  let hint = code ? BY_CODE[code] : undefined;
  if (!hint && /fetch failed|ECONNREFUSED|ENOTFOUND|network|timed? ?out/i.test(message)) hint = "The database or a service could not be reached. Check your connection and the Supabase project status, then try again.";
  if (!hint && /JWT|token.*expired/i.test(message)) hint = "Your sign-in has expired. Sign out and back in.";
  if (!hint && /relation .* does not exist|schema cache/i.test(message)) hint = "A table is missing. A database migration has probably not been applied yet.";
  if (!hint) hint = dbHint ?? "Try again. If it keeps happening, copy the details and check the server logs.";
  return { message, code, details, hint };
}
