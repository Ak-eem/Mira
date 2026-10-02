// Guards against auto-reply loops: bounces, out-of-office replies, mailing
// lists and other machines must never get an AI reply (which would itself
// trigger another automatic response, and so on).

const AUTOMATED_LOCAL_PARTS = /^(mailer-daemon|postmaster|no-?reply|do-?not-?reply|bounces?|notifications?|daemon)([+._-].*)?$/i;

function header(headers: Record<string, string> | null | undefined, name: string): string | undefined {
  if (!headers) return undefined;
  const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === name);
  return key ? String(headers[key]).trim().toLowerCase() : undefined;
}

/** Cheap check on the sender address alone; safe to run before fetching the email. */
export function isAutomatedSenderAddress(sender: string, ownAddresses: readonly string[] = []): boolean {
  const address = (sender.match(/<([^>]+)>/)?.[1] ?? sender).trim().toLowerCase();
  if (ownAddresses.some((own) => own && own.trim().toLowerCase() === address)) return true;
  const local = address.split("@")[0] ?? "";
  return AUTOMATED_LOCAL_PARTS.test(local);
}

/** Header-based check (RFC 3834 and the common bulk/list conventions). */
export function hasAutomatedHeaders(headers: Record<string, string> | null | undefined): boolean {
  const autoSubmitted = header(headers, "auto-submitted");
  if (autoSubmitted && autoSubmitted !== "no") return true;
  const precedence = header(headers, "precedence");
  if (precedence && ["bulk", "junk", "list", "auto_reply"].includes(precedence)) return true;
  if (header(headers, "x-auto-response-suppress")) return true;
  if (header(headers, "list-id") || header(headers, "list-unsubscribe")) return true;
  return false;
}
