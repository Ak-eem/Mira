import { randomUUID } from "crypto";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
type Client = ReturnType<typeof createServiceRoleClient>;
const LEASE_MS = 5 * 60 * 1000;
export class ConversationBusyError extends Error { status = 409; constructor() { super("Conversation is busy; retry shortly."); } }
/** Durable lease serializes a conversation's read/LLM/write pipeline across instances. */
export async function withConversationLease<T>(client: Client, key: string, work: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 120; attempt++) {
    const token = randomUUID(); const now = new Date(); const expires = new Date(now.getTime() + LEASE_MS).toISOString();
    const inserted = await client.from("conversation_processing_leases").insert({ conversation_key: key, lease_token: token, acquired_at: now.toISOString(), expires_at: expires });
    if (!inserted.error) {
      try { return await work(); } finally { await client.from("conversation_processing_leases").delete().eq("conversation_key", key).eq("lease_token", token); }
    }
    if (inserted.error.code !== "23505") throw inserted.error;
    const stolen = await client.from("conversation_processing_leases").update({ lease_token: token, acquired_at: now.toISOString(), expires_at: expires }).eq("conversation_key", key).lt("expires_at", now.toISOString()).select("lease_token").maybeSingle();
    if (stolen.error) throw stolen.error;
    if (stolen.data) { try { return await work(); } finally { await client.from("conversation_processing_leases").delete().eq("conversation_key", key).eq("lease_token", token); } }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new ConversationBusyError();
}
