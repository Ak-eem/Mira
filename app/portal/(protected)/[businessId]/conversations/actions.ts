"use server";

import { revalidatePath } from "next/cache";
import { getCurrentBusinessOwner } from "@/lib/supabase/portal-auth";
import { createClient } from "@/lib/supabase/server";
import { sendWhatsappReply } from "@/lib/whatsapp/sendMessage";

// Mirrors app/admin/.../conversations/actions.ts's resolveHandoff, but
// checked against business-owner membership instead of platform-admin --
// deliberately a separate function rather than a shared one with a role
// param, so the two auth checks can never accidentally get swapped.
export async function resolveHandoff(businessId: string, conversationId: string): Promise<void> {
  const owner = await getCurrentBusinessOwner();
  if (!owner || !owner.businesses.some((b) => b.id === businessId)) {
    console.error("resolveHandoff (portal) called without owning this business");
    return;
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("conversations")
    .update({ needs_human: false })
    .eq("id", conversationId)
    .eq("business_id", businessId);

  if (error) {
    console.error("Failed to resolve handoff flag (portal):", error);
    return;
  }

  revalidatePath(`/portal/${businessId}/conversations/${conversationId}`);
  revalidatePath(`/portal/${businessId}/conversations`);
  revalidatePath(`/portal/${businessId}`);
}

// Mirrors app/admin/.../conversations/actions.ts's replyToConversation,
// checked against business-owner membership instead of platform-admin --
// same reasoning as resolveHandoff above for keeping this a separate
// function rather than a shared one with a role param.
export async function replyToConversation(
  businessId: string,
  conversationId: string,
  text: string,
): Promise<{ error?: string }> {
  const owner = await getCurrentBusinessOwner();
  if (!owner || !owner.businesses.some((b) => b.id === businessId)) {
    return { error: "Not authenticated." };
  }

  const trimmed = text.trim();
  if (!trimmed) {
    return { error: "Reply can't be empty." };
  }

  const supabase = await createClient();

  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .select("id, session_token, channel")
    .eq("id", conversationId)
    .eq("business_id", businessId)
    .maybeSingle();

  if (convError || !conversation) {
    console.error("replyToConversation (portal): conversation lookup failed", convError);
    return { error: "Conversation not found." };
  }

  const { data: insertedMessage, error: insertError } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      business_id: businessId,
      role: "assistant",
      content: trimmed,
      context_snapshot: { operatorReply: true, repliedBy: owner.userId },
    })
    .select("id")
    .single();

  if (insertError || !insertedMessage) {
    console.error("replyToConversation (portal): message insert failed", insertError);
    return { error: "Failed to save reply." };
  }

  await supabase
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conversationId);

  if (conversation.channel === "whatsapp" && conversation.session_token.startsWith("wa_")) {
    const customerPhone = conversation.session_token.slice(3);
    const { data: business } = await supabase
      .from("businesses")
      .select("whatsapp_phone_number_id")
      .eq("id", businessId)
      .maybeSingle();

    if (!business?.whatsapp_phone_number_id) {
      console.error("replyToConversation (portal): no whatsapp_phone_number_id configured for", businessId);
      return { error: "Reply saved, but this business has no WhatsApp number configured to send from." };
    }

    const sent = await sendWhatsappReply(business.whatsapp_phone_number_id, customerPhone, trimmed);
    if (!sent) {
      return {
        error: "Reply saved, but the WhatsApp message failed to send. Check the WhatsApp configuration and try again.",
      };
    }
  }

  revalidatePath(`/portal/${businessId}/conversations/${conversationId}`);
  revalidatePath(`/portal/${businessId}/conversations`);

  return {};
}
