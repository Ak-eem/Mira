import type { createServiceRoleClient } from "@/lib/supabase/service-role";

type Client = ReturnType<typeof createServiceRoleClient>;
export type QueueRow = { id: string; status: string; attempts: number; reply_text: string | null; reply_sent_at: string | null };
const QUEUE_COLUMNS = "id,status,attempts,reply_text,reply_sent_at";
// A message that keeps failing is dropped after this many claims so a poison
// message can't be redelivered forever. The webhook acks it with a 200.
export const MAX_INBOUND_ATTEMPTS = 5;

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
  if (row.attempts >= MAX_INBOUND_ATTEMPTS) {
    console.error(`Email queue row ${row.id} exceeded ${MAX_INBOUND_ATTEMPTS} attempts; not claiming.`);
    return false;
  }
  const now = new Date();
  const claim = await client
    .from("email_inbound_queue")
    .update({ status: "processing", locked_at: now.toISOString(), attempts: row.attempts + 1 })
    .eq("id", row.id)
    .in("status", ["pending", "failed"])
    .lte("available_at", now.toISOString())
    .select("id");
  if (claim.error) throw claim.error;
  if (Boolean(claim.data?.length)) return true;
  const stale = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
  const reclaim = await client
    .from("email_inbound_queue")
    .update({ status: "processing", locked_at: now.toISOString(), attempts: row.attempts + 1 })
    .eq("id", row.id)
    .eq("status", "processing")
    .lt("locked_at", stale)
    .select("id");
  if (reclaim.error) throw reclaim.error;
  return Boolean(reclaim.data?.length);
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