// Small formatting helpers shared across admin views. Will get reused
// again for the activity timeline in the next session -- built here
// once rather than duplicated later.
export function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return "just now";

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? "" : "s"} ago`;

  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} hour${diffHour === 1 ? "" : "s"} ago`;

  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 30) return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;

  return new Date(iso).toLocaleDateString();
}

/** "16 Oct 2026, 1:38 pm" in Lagos time, whatever the viewer's browser or the server's locale is. */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-NG", { timeZone: "Africa/Lagos", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}
