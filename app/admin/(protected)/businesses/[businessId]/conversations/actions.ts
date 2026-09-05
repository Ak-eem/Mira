"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAdmin } from "@/lib/supabase/admin-auth";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activityLog";
import { sendWhatsappReply } from "@/lib/whatsapp/sendMessage";

// Clears the needs_human flag Mira sets when a customer asks for a person
// or gets stuck in a loop (see lib/chat/handoff.ts). Bound with
// businessId/conversationId via .bind() and used directly as a <form
// action> (see the conversation thread page), which requires a
// void-returning function -- failures are logged server-side rather than
// surfaced back to a client component, same fire-and-forget spirit as
// logActivity itself.
export async function resolveHandoff(businessId: string, conversationId: string): Promise<void> {
  const admin = await getCurrentAdmin();
  if (!admin) {
    console.error("resolveHandoff called without an authenticated admin");
    return;
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("conversations")
    .update({ needs_human: false })
    .eq("id", conversationId)
    .eq("business_id", businessId);

  if (error) {
    console.error("Failed to resolve handoff flag:", error);
    return;
  }

  await logActivity(
    businessId,
    "conversation",
    conversationId,
    "updated",
    "Conversation marked resolved",
    "admin_ui",
  );

  revalidatePath(`/admin/businesses/${businessId}/conversations/${conversationId}`);
  revalidatePath(`/admin/businesses/${businessId}/conversations`);
  revalidatePath(`/admin/businesses/${businessId}`);
  revalidatePath(`/admin`);
}

// Lets a business operator actually respond once a conversation has been
// flagged for a human -- previously the only control on this page was
// "Mark resolved", with no way to message the customer back through Mira
// at all. For WhatsApp conversations this also delivers the reply to the
// customer's phone; for web, inserting the message is enough since the
// widget polls for new messages while a conversation is flagged.
export async function replyToConversation(
  businessId: string,
  conversationId: string,
  text: string,
): Promise<{ error?: string }> {
  const admin = await getCurrentAdmin();
  if (!admin) {
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
    console.error("replyToConversation: conversation lookup failed", convError);
    return { error: "Conversation not found." };
  }

  const { data: insertedMessage, error: insertError } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      business_id: businessId,
      role: "assistant",
      content: trimmed,
      context_snapshot: { operatorReply: true, repliedBy: admin.id },
    })
    .select("id")
    .single();

  if (insertError || !insertedMessage) {
    console.error("replyToConversation: message insert failed", insertError);
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
      console.error("replyToConversation: no whatsapp_phone_number_id configured for", businessId);
      return { error: "Reply saved, but this business has no WhatsApp number configured to send from." };
    }

    const sent = await sendWhatsappReply(business.whatsapp_phone_number_id, customerPhone, trimmed);
    if (!sent) {
      return {
        error: "Reply saved, but the WhatsApp message failed to send. Check the WhatsApp configuration and try again.",
      };
    }
  }

  await logActivity(
    businessId,
    "conversation",
    conversationId,
    "updated",
    "Operator replied to conversation",
    "admin_ui",
  );

  revalidatePath(`/admin/businesses/${businessId}/conversations/${conversationId}`);
  revalidatePath(`/admin/businesses/${businessId}/conversations`);

  return {};
}

