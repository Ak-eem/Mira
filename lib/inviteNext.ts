// A team-invite link looks like /invite/<token>. The invite page sends people who need
// an account to sign up or log in and asks to be returned afterwards (?next=). That
// value comes from the URL, so it is only honoured when it is exactly an invite path:
// never an arbitrary page, never another site. Tokens are hex today; the character set
// below also allows url-safe base64 in case that changes.
const INVITE_PATH = /^\/invite\/[A-Za-z0-9_-]{8,256}$/;

/** Returns `value` if it is a plain /invite/<token> path, otherwise null. */
export function safeInvitePath(value: unknown): string | null {
  return typeof value === "string" && INVITE_PATH.test(value) ? value : null;
}
