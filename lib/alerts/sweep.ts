import { sendAlertCore, type AlertDeps, type AlertResult } from "./core";

type Client = { from: (table: string) => any };  

export const STUCK_AFTER_MINUTES = 15;
const LOOKBACK_DAYS = 7;
// Rows that fail for a reason a retry can never fix (mail to an address no business owns) are not worth an alert.
const PERMANENT_ERRORS = ["No business is configured for this inbound address."];
const QUEUES = [
  { table: "whatsapp_inbound_queue", channel: "WhatsApp" },
  { table: "email_inbound_queue", channel: "Email" },
] as const;

export type StuckRow = { channel: string; id: string; status: string; attempts: number; ageMinutes: number; lastError: string | null };
export type Problems = { stuck: StuckRow[]; ai: { total: number; failed: number } };

/** Inbound messages that were never answered: not "done" and older than STUCK_AFTER_MINUTES. */
export async function findStuckRows(client: Client, now: Date): Promise<StuckRow[]> {
  const olderThan = new Date(now.getTime() - STUCK_AFTER_MINUTES * 60_000).toISOString();
  const since = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 3600_000).toISOString();
  const out: StuckRow[] = [];
  for (const { table, channel } of QUEUES) {
    const { data, error } = await client
      .from(table)
      .select("id,status,attempts,created_at,last_error")
      .neq("status", "done")
      .lt("created_at", olderThan)
      .gt("created_at", since)
      .order("created_at", { ascending: true })
      .limit(50);
    if (error) throw error;
    for (const row of data ?? []) {
      if (row.last_error && PERMANENT_ERRORS.includes(row.last_error)) continue;
      out.push({
        channel,
        id: row.id,
        status: row.status,
        attempts: row.attempts,
        ageMinutes: Math.round((now.getTime() - new Date(row.created_at).getTime()) / 60_000),
        lastError: row.last_error ?? null,
      });
    }
  }
  return out;
}

export async function findProblems(client: Client, now: Date = new Date()): Promise<Problems> {
  const since = new Date(now.getTime() - 24 * 3600_000).toISOString();
  const [stuck, total, failed] = await Promise.all([
    findStuckRows(client, now),
    client.from("ai_response_telemetry").select("id", { count: "exact", head: true }).gte("created_at", since),
    client.from("ai_response_telemetry").select("id", { count: "exact", head: true }).gte("created_at", since).eq("success", false),
  ]);
  if (total.error) throw total.error;
  if (failed.error) throw failed.error;
  return { stuck, ai: { total: total.count ?? 0, failed: failed.count ?? 0 } };
}

/** At least this many failures AND at least this share of replies in 24h counts as a provider problem. */
export const AI_FAILURE_MIN = 5;
export const AI_FAILURE_RATIO = 0.2;

export function digestFrom(problems: Problems): { subject: string; lines: string[] } | null {
  const lines: string[] = [];
  if (problems.stuck.length > 0) {
    lines.push(`${problems.stuck.length} customer message(s) have gone unanswered for over ${STUCK_AFTER_MINUTES} minutes (open /admin/queue to retry):`);
    for (const row of problems.stuck.slice(0, 10)) {
      lines.push(`  ${row.channel} ${row.id.slice(0, 8)} - ${row.status}, ${row.attempts} attempt(s), ${row.ageMinutes} min old${row.lastError ? ` - ${row.lastError.slice(0, 120)}` : ""}`);
    }
    if (problems.stuck.length > 10) lines.push(`  ...and ${problems.stuck.length - 10} more`);
  }
  const { total, failed } = problems.ai;
  if (failed >= AI_FAILURE_MIN && total > 0 && failed / total >= AI_FAILURE_RATIO) {
    lines.push(`AI provider: ${failed} of ${total} replies failed in the last 24 hours (${Math.round((failed / total) * 100)}%).`);
  }
  if (lines.length === 0) return null;
  const parts = [];
  if (problems.stuck.length > 0) parts.push(`${problems.stuck.length} unanswered message(s)`);
  if (lines.some((line) => line.startsWith("AI provider"))) parts.push("AI provider errors");
  return { subject: parts.join(" + "), lines };
}

export async function runAlertSweep(client: Client, deps: AlertDeps): Promise<{ problems: Problems; result: AlertResult | "nothing_to_report" }> {
  const now = (deps.now ?? (() => new Date()))();
  const problems = await findProblems(client, now);
  const digest = digestFrom(problems);
  if (!digest) return { problems, result: "nothing_to_report" };
  const result = await sendAlertCore(client, { key: "sweep", subject: digest.subject, lines: digest.lines, cooldownMinutes: 20 * 60 }, deps);
  return { problems, result };
}
