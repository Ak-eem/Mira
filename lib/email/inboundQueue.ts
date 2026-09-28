import type { createServiceRoleClient } from "@/lib/supabase/service-role";

type Client = ReturnType<typeof createServiceRoleClient>;
export type QueueRow = { id: string; status: string; attempts: number; reply_text: string | null; reply_sent_at: string | null };
const QUEUE_COLUMNS = "id,status,attempts,reply_text,reply_sent_at";
// A message that keeps failing is dropped after this many claims so a poison
// message can't be redelivered forever. The webhook acks it with a 200.
export const MAX_INBOUND_ATTEMPTS = 5;
// A "processing" row whose lock is older than this is treated as abandoned.
const STALE_LOCK_SECONDS = 5 * 60;

export async function enqueueInboundMessage(client: Client, resendEmailId: string, toAddress: string, payload: unknown): Promise<QueueRow> {
  const created = await client
    .from("email_inbound_queue")
    .insert({ resend_email_id: resendEmailId, to_address: toAddress, payload, status: "pending", available_at: new Date().toISOString() })
    .select(QUEUE_COLUMNS)
    .single();
  if (!created.error && created.data) return created.data as QueueRow;
  if (created.error?.code !== "23505") throw created.error ?? new Error("Unable to enqueue email message");
  const existing = await client
    .from("email_inbound_queue")
    .select(QUEUE_COLUMNS)
    .eq("resend_email_id", resendEmailId)
    .single();
  if (existing.error || !existing.data) throw existing.error ?? new Error("Unable to read email queue row");
  return existing.data as QueueRow;
}

export async function claimInboundMessage(client: Client, row: Pick<QueueRow, "id" | "attempts">): Promise<boolean> {
  // Cheap early exit off the caller's (possibly stale) read. It can only
  // understate attempts, so it never wrongly refuses; the RPC below is the
  // real gate and re-checks the cap against the current DB value.
  if (row.attempts >= MAX_INBOUND_ATTEMPTS) {
    console.error(`Email queue row ${row.id} exceeded ${MAX_INBOUND_ATTEMPTS} attempts; not claiming.`);
    return false;
  }
  // One atomic UPDATE in the database (migration 0050): increments attempts
  // from the current row value, enforces the cap, and handles both the
  // normal claim and the stale-lock reclaim, so a stale read can't rewind
  // the counter or push a poison message past the cap.
  const { data, error } = await client.rpc("claim_email_inbound", {
    p_id: row.id,
    p_max_attempts: MAX_INBOUND_ATTEMPTS,
    p_stale_after_seconds: STALE_LOCK_SECONDS,
  });
  if (error) throw error;
  return data === true;
}

/** Outbox: persist the reply text BEFORE sending so a retry re-sends it instead of regenerating. */
export async function saveInboundReply(client: Client, id: string, replyText: string): Promise<void> {
  const { error } = await client.from("email_inbound_queue").update({ reply_text: replyText }).eq("id", id);
  if (error) throw error;
}

/** Records the send and completes the row in one update. */
export async function markInboundSent(client: Client, id: string): Promise<void> {
  const { error } = await client
    .from("email_inbound_queue")
    .update({ status: "done", reply_sent_at: new Date().toISOString(), locked_at: null, last_error: null })
    .eq("id", id);
  if (error) throw error;
}

export async function markInboundDone(client: Client, id: string): Promise<void> {
  const { error } = await client
    .from("email_inbound_queue")
    .update({ status: "done", locked_at: null, last_error: null })
    .eq("id", id);
  if (error) throw error;
}

export async function markInboundFailed(client: Client, id: string, message: string): Promise<void> {
  const { error } = await client
    .from("email_inbound_queue")
    .update({ status: "failed", locked_at: null, available_at: new Date(Date.now() + 30_000).toISOString(), last_error: message.slice(0, 2000) })
    .eq("id", id);
  if (error) console.error("Could not mark email queue row failed:", error);
}