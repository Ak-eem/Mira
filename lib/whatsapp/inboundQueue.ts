import { createServiceRoleClient } from "@/lib/supabase/service-role";
type Client = ReturnType<typeof createServiceRoleClient>;
export type QueueRow = { id: string; status: string; attempts: number };
export async function enqueueInboundMessage(client: Client, messageId: string, phoneId: string, payload: unknown): Promise<QueueRow> {
  const created = await client.from("whatsapp_inbound_queue").insert({ message_id: messageId, waba_phone_number_id: phoneId, payload, status: "pending", available_at: new Date().toISOString() }).select("id,status,attempts").single();
  if (!created.error && created.data) return created.data as QueueRow;
  if (created.error?.code !== "23505") throw created.error ?? new Error("Unable to enqueue WhatsApp message");
  const existing = await client.from("whatsapp_inbound_queue").select("id,status,attempts").eq("message_id", messageId).eq("waba_phone_number_id", phoneId).single();
  if (existing.error || !existing.data) throw existing.error ?? new Error("Unable to read queue row");
  return existing.data as QueueRow;
}
export async function claimInboundMessage(client: Client, id: string): Promise<boolean> {
  const now = new Date();
  const claim = await client.from("whatsapp_inbound_queue").update({ status: "processing", locked_at: now.toISOString() }).eq("id", id).in("status", ["pending", "failed"]).lte("available_at", now.toISOString()).select("id");
  if (claim.error) throw claim.error;
  if (Boolean(claim.data?.length)) return true;
  const stale = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
  const reclaim = await client.from("whatsapp_inbound_queue").update({ status: "processing", locked_at: now.toISOString() }).eq("id", id).eq("status", "processing").lt("locked_at", stale).select("id");
  if (reclaim.error) throw reclaim.error;
  return Boolean(reclaim.data?.length);
}
export async function markInboundDone(client: Client, id: string): Promise<void> { const { error } = await client.from("whatsapp_inbound_queue").update({ status: "done", locked_at: null, last_error: null }).eq("id", id); if (error) throw error; }
export async function markInboundFailed(client: Client, id: string, message: string): Promise<void> { const { error } = await client.from("whatsapp_inbound_queue").update({ status: "failed", locked_at: null, available_at: new Date(Date.now() + 30_000).toISOString(), last_error: message.slice(0, 2000) }).eq("id", id); if (error) console.error("Could not mark WhatsApp queue row failed:", error); }
