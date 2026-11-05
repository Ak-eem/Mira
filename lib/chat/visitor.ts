// Web-chat visitor ids are the only credential protecting a visitor's
// transcript (the session token is web_${visitorId}), and they key the rate
// limiter. Accepted shapes:
//   - a UUID (what the widget generates today), or
//   - the legacy `<13-digit-ms-timestamp>-<base36>` id older widgets stored in
//     localStorage; kept so existing visitors don't lose their conversation.
// Anything else ("1", "admin", path characters, 10 KB strings) is refused.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LEGACY = /^\d{13}-[a-z0-9]{1,32}$/i;

/** Returns the trimmed id if it is a recognised client-generated id, else null. */
export function parseVisitorId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return UUID.test(trimmed) || LEGACY.test(trimmed) ? trimmed : null;
}

/** RFC 4122 v4 UUID from crypto.getRandomValues (works where randomUUID doesn't). */
export function uuidV4FromRandomValues(getRandomValues: (bytes: Uint8Array) => Uint8Array): string {
  const bytes = getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
