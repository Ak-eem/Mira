import type { createServiceRoleClient } from "@/lib/supabase/service-role";
type Client = ReturnType<typeof createServiceRoleClient>;
export type QueueRow = { id: string; status: string; attempts: number; reply_text: string | null; reply_sent_at: string | null; send_started_at: string | null; send_resent: boolean };
const QUEUE_COLUMNS = "id,status,attempts,reply_text,reply_sent_at,send_started_at,send_resent";
// A message that keeps failing is dropped after this many claims so a poison
// message can't be redelivered forever. The webhook acks it with a 200.
export const MAX_INBOUND_ATTEMPTS = 5;
export async function enqueueInboundMessage(client: Client, messageId: string, phoneId: string, payload: unknown): Promise<QueueRow> {
  const created = await client.from("whatsapp_inbound_queue").insert({ message_id: messageId, waba_phone_number_id: phoneId, payload, status: "pending", available_at: new Date().toISOString() }).select(QUEUE_COLUMNS).single();
  if (!created.error && created.data) return created.data as QueueRow;
  if (created.error?.code !== "23505") throw created.error ?? new Error("Unable to enqueue WhatsApp message");
  const existing = await client.from("whatsapp_inbound_queue").select(QUEUE_COLUMNS).eq("message_id", messageId).eq("waba_phone_number_id", phoneId).single();
  if (existing.error || !existing.data) throw existing.error ?? new Error("Unable to read queue row");
  return existing.data as QueueRow;
}
export async function claimInboundMessage(client: Client, row: Pick<QueueRow, "id" | "attempts">): Promise<boolean> {
  if (row.attempts >= MAX_INBOUND_ATTEMPTS) {
    console.error(`WhatsApp queue row ${row.id} exceeded ${MAX_INBOUND_ATTEMPTS} attempts; not claiming.`);
    return false;
  }
  const now = new Date();
  // Only the winner of the status-guarded update writes attempts, so the
  // read-then-write of the counter can't be raced by another claimer.
  const claim = await client.from("whatsapp_inbound_queue").update({ status: "processing", locked_at: now.toISOString(), attempts: row.attempts + 1 }).eq("id", row.id).in("status", ["pending", "failed"]).lte("available_at", now.toISOString()).select("id");
  if (claim.error) throw claim.error;
  if (Boolean(claim.data?.length)) return true;
  const stale = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
  const reclaim = await client.from("whatsapp_inbound_queue").update({ status: "processing", locked_at: now.toISOString(), attempts: row.attempts + 1 }).eq("id", row.id).eq("status", "processing").lt("locked_at", stale).select("id");
  if (reclaim.error) throw reclaim.error;
  return Boolean(reclaim.data?.length);
}
/** Outbox: persist the reply text BEFORE sending so a retry re-sends it instead of regenerating. */
export async function saveInboundReply(client: Client, id: string, replyText: string): Promise<void> { const { error } = await client.from("whatsapp_inbound_queue").update({ reply_text: replyText }).eq("id", id); if (error) throw error; }
/**
 * Records the send (and Meta's message id) and completes the row in one update.
 * This runs right after a confirmed send, so a transient DB error here is the
 * one place a duplicate could still sneak in: retry a few times before giving up.
 */
export async function markInboundSent(client: Client, id: string, outboundMessageId?: string | null): Promise<void> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const { error } = await client.from("whatsapp_inbound_queue").update({ status: "done", reply_sent_at: new Date().toISOString(), outbound_message_id: outboundMessageId ?? null, locked_at: null, last_error: null }).eq("id", id);
    if (!error) return;
    lastError = error;
    await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
  }
  throw lastError;
}
/**
 * The Cloud API has no send idempotency key. If a previous attempt started a
 * send and never recorded its result (crash, DB error, timeout), whether the
 * customer already got the message is unknowable. Policy: prefer one possible
 * duplicate over silence, but only ONE ambiguous re-send per message; after
 * that the row is closed and logged instead of looping.
 */
export function decideSend(row: Pick<QueueRow, "send_started_at" | "send_resent">): { action: "send"; resend: boolean } | { action: "abandon" } {
  if (row.send_started_at === null) return { action: "send", resend: false };
  return row.send_resent ? { action: "abandon" } : { action: "send", resend: true };
}
/** Written BEFORE the request goes out; still set afterwards means the outcome was never recorded. */
export async function markSendStarted(client: Client, id: string, resend: boolean): Promise<void> { const { error } = await client.from("whatsapp_inbound_queue").update({ send_started_at: new Date().toISOString(), send_resent: resend }).eq("id", id); if (error) throw error; }
/** Meta definitively refused it, so a retry can't duplicate anything. */
export async function markSendRejected(client: Client, id: string): Promise<void> { const { error } = await client.from("whatsapp_inbound_queue").update({ send_started_at: null }).eq("id", id); if (error) console.error("Could not clear WhatsApp send marker:", error); }
/** Gives up on an ambiguous send that already had its one re-send. Not silent: it is logged and kept on the row. */
export async function markSendAbandoned(client: Client, id: string): Promise<void> { const { error } = await client.from("whatsapp_inbound_queue").update({ status: "done", locked_at: null, last_error: "Delivery unconfirmed after an ambiguous send and one re-send; not retried again." }).eq("id", id); if (error) throw error; }
export async function markInboundDone(client: Client, id: string): Promise<void> { const { error } = await client.from("whatsapp_inbound_queue").update({ status: "done", locked_at: null, last_error: null }).eq("id", id); if (error) throw error; }
export async function markInboundFailed(client: Client, id: string, message: string): Promise<void> { const { error } = await client.from("whatsapp_inbound_queue").update({ status: "failed", locked_at: null, available_at: new Date(Date.now() + 30_000).toISOString(), last_error: message.slice(0, 2000) }).eq("id", id); if (error) console.error("Could not mark WhatsApp queue row failed:", error); }
