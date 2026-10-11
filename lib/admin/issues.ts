import { findStuckRows, type StuckRow } from "@/lib/alerts/sweep";

type Client = { from: (table: string) => any };  

export type Issue = {
  id: string;
  severity: "error" | "warn";
  title: string;
  detail: string;
  /** ISO time of the most recent occurrence. */
  when: string;
  href?: string;
};

type AiFailure = { provider: string; error_code: string | null; created_at: string };

/** Many identical AI failures are one problem, not fifty: group by provider + error code. */
export function groupAiFailures(rows: AiFailure[]): Issue[] {
  const groups = new Map<string, { provider: string; code: string; count: number; last: string }>();
  for (const row of rows) {
    const code = row.error_code ?? "unknown error";
    const key = `${row.provider}|${code}`;
    const group = groups.get(key);
    if (!group) groups.set(key, { provider: row.provider, code, count: 1, last: row.created_at });
    else {
      group.count += 1;
      if (row.created_at > group.last) group.last = row.created_at;
    }
  }
  return [...groups.values()].map((g) => ({
    id: `ai:${g.provider}:${g.code}`,
    severity: g.count >= 5 ? "error" : "warn",
    title: `AI replies failing (${g.provider})`,
    detail: `${g.count} failure${g.count === 1 ? "" : "s"} with "${g.code}" in the last 24 hours.`,
    when: g.last,
  }));
}

export function stuckToIssues(rows: StuckRow[], now: Date): Issue[] {
  return rows.map((row) => ({
    id: `msg:${row.channel}:${row.id}`,
    severity: "error" as const,
    title: `${row.channel} message unanswered`,
    detail: `${row.status}, ${row.attempts} attempt${row.attempts === 1 ? "" : "s"}, ${row.ageMinutes} min old${row.lastError ? `. ${row.lastError.slice(0, 160)}` : ""}`,
    when: new Date(now.getTime() - row.ageMinutes * 60_000).toISOString(),
    href: "/admin/queue",
  }));
}

/** Errors first, then most recent first. */
export function sortIssues(issues: Issue[]): Issue[] {
  return [...issues].sort((a, b) => (a.severity === b.severity ? b.when.localeCompare(a.when) : a.severity === "error" ? -1 : 1));
}

export async function loadIssues(client: Client, now: Date = new Date()): Promise<Issue[]> {
  const since = new Date(now.getTime() - 24 * 3600_000).toISOString();
  const [stuck, ai] = await Promise.all([
    findStuckRows(client, now),
    client.from("ai_response_telemetry").select("provider,error_code,created_at").eq("success", false).gte("created_at", since).order("created_at", { ascending: false }).limit(500),
  ]);
  if (ai.error) throw ai.error;
  return sortIssues([...stuckToIssues(stuck, now), ...groupAiFailures((ai.data ?? []) as AiFailure[])]);
}
