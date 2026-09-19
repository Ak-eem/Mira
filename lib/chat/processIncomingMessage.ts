import { processMessage } from "@/lib/chat/processMessage";
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
): Promise<ChatResult> {
  const conversation = await client
    .from("conversations")
    .select("id,claimed_by")
    .eq("business_id", businessId)
    .eq("session_token", sessionToken)
    .eq("status", "open")
    .maybeSingle();
  if (conversation.error) throw conversation.error;

  if (conversation.data?.claimed_by) {
    const saved = await client
      .from("messages")
      .insert({
        conversation_id: conversation.data.id,
        business_id: businessId,
        role: "customer",
        content: message,
      })
      .select("id")
      .single();
    if (saved.error || !saved.data) throw saved.error ?? new Error("Could not save customer message.");

    const timestamp = await client
      .from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conversation.data.id);
    if (timestamp.error) throw timestamp.error;

    return { reply: "", messageId: saved.data.id, productImages: [], silent: true };
  }

  return processMessage(businessId, sessionToken, message, channel);
}
