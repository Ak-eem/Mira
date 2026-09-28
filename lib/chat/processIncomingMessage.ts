import { processMessage } from "@/lib/chat/processMessage";
import { CONVERSATION_IDLE_TIMEOUT_MS } from "@/lib/chat/conversation";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type ChatResult = Awaited<ReturnType<typeof processMessage>> & { silent?: boolean };

type Client = ReturnType<typeof createServiceRoleClient>;

// If a human operator has already claimed this conversation, Mira stays
// silent: save the customer's message and bump last_message_at, but don't
// generate a reply. Otherwise, hand off to the normal AI pipeline.
//
// Shared across all three inbound channels (web chat, WhatsApp, email) --
// previously this exact logic was copy-pasted three times, once per
// channel's route handler.
export async function processIncomingMessage(
  client: Client,
  businessId: string,
  sessionToken: string,
  message: string,
  channel: "web" | "whatsapp" | "email",
  inboundKey?: string,
): Promise<ChatResult> {
  const conversation = await client
    .from("conversations")
    .select("id,claimed_by,last_message_at")
    .eq("business_id", businessId)
    .eq("session_token", sessionToken)
    .eq("status", "open")
    .maybeSingle();
  if (conversation.error) throw conversation.error;

  // A claimed conversation that has sat idle past the timeout is NOT silenced:
  // processMessage closes expired conversations and starts a fresh one, so
  // fall through to it. Otherwise a customer returning after >24h would have
  // their message swallowed with no reply.
  const claimedAndActive =
    Boolean(conversation.data?.claimed_by) &&
    Date.now() - new Date(conversation.data!.last_message_at).getTime() < CONVERSATION_IDLE_TIMEOUT_MS;

  if (conversation.data && claimedAndActive) {
    const saved = await client
      .from("messages")
      .insert({
        conversation_id: conversation.data.id,
        business_id: businessId,
        role: "customer",
        content: message,
        inbound_key: inboundKey ?? null,
      })
      .select("id")
      .single();
    // 23505 on inbound_key: a previous attempt already saved this message.
    if (saved.error?.code === "23505" && inboundKey) {
      const existing = await client
        .from("messages")
        .select("id")
        .eq("business_id", businessId)
        .eq("inbound_key", inboundKey)
        .single();
      if (existing.error || !existing.data) throw existing.error ?? new Error("Could not read saved customer message.");
      return { reply: "", messageId: existing.data.id, productImages: [], silent: true };
    }
    if (saved.error || !saved.data) throw saved.error ?? new Error("Could not save customer message.");

    const timestamp = await client
      .from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conversation.data.id);
    if (timestamp.error) throw timestamp.error;

    return { reply: "", messageId: saved.data.id, productImages: [], silent: true };
  }

  return processMessage(businessId, sessionToken, message, channel, inboundKey);
}
