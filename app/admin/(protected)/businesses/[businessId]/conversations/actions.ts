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
    .select("id, session_token, channel, claimed_by")
    .eq("id", conversationId)
    .eq("business_id", businessId)
    .maybeSingle();

  if (convError || !conversation) {
    console.error("replyToConversation: conversation lookup failed", convError);
    return { error: "Conversation not found." };
  }

  if (!conversation.claimed_by) {
    return { error: "Take over this conversation before replying." };
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


// Explicitly claims a flagged conversation for this operator -- distinct
// from just replying. Once claimed, Mira goes fully silent (see the
// matching check in lib/chat/processMessage.ts and app/api/chat/route.ts)
// and a system-notice message marks the handover in the thread itself,
// so anyone reading the transcript later can see exactly when and by
// whom a human stepped in.
export async function takeOverConversation(businessId: string, conversationId: string): Promise<void> {
  const admin = await getCurrentAdmin();
  if (!admin) {
    console.error("takeOverConversation called without an authenticated admin");
    return;
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("conversations")
    .update({ claimed_by: admin.email, claimed_at: new Date().toISOString() })
    .eq("id", conversationId)
    .eq("business_id", businessId);

  if (error) {
    console.error("takeOverConversation: update failed", error);
    return;
  }

  const { error: noticeError } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    business_id: businessId,
    role: "assistant",
    content: `${admin.email} took over this conversation.`,
    context_snapshot: { systemNotice: true },
  });

  if (noticeError) {
    console.error("takeOverConversation: system notice insert failed", noticeError);
  }

  await logActivity(
    businessId,
    "conversation",
    conversationId,
    "updated",
    `${admin.email} took over conversation`,
    "admin_ui",
  );

  revalidatePath(`/admin/businesses/${businessId}/conversations/${conversationId}`);
  revalidatePath(`/admin/businesses/${businessId}/conversations`);
}

// Reverses a take-over: clears the claim AND needs_human entirely, so
// the conversation goes right back to being handled normally by Mira,
// not just back into the "flagged, unclaimed" limbo state.
export async function handBackToAI(businessId: string, conversationId: string): Promise<void> {
  const admin = await getCurrentAdmin();
  if (!admin) {
    console.error("handBackToAI called without an authenticated admin");
    return;
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("conversations")
    .update({ claimed_by: null, claimed_at: null, needs_human: false })
    .eq("id", conversationId)
    .eq("business_id", businessId);

  if (error) {
    console.error("handBackToAI: update failed", error);
    return;
  }

  const { error: noticeError } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    business_id: businessId,
    role: "assistant",
    content: `${admin.email} handed the conversation back to Mira.`,
    context_snapshot: { systemNotice: true },
  });

  if (noticeError) {
    console.error("handBackToAI: system notice insert failed", noticeError);
  }

  await logActivity(
    businessId,
    "conversation",
    conversationId,
    "updated",
    `${admin.email} handed conversation back to Mira`,
    "admin_ui",
  );

  revalidatePath(`/admin/businesses/${businessId}/conversations/${conversationId}`);
  revalidatePath(`/admin/businesses/${businessId}/conversations`);
}

// Closes the conversation out entirely -- reuses the same status='closed'
// mechanism already used for idle-timeout closes (see
// CONVERSATION_IDLE_TIMEOUT_MS in lib/chat/conversation.ts), so a
// customer messaging again afterward transparently starts a fresh
// conversation rather than needing any special "reopen" handling.
export async function endConversation(businessId: string, conversationId: string): Promise<void> {
  const admin = await getCurrentAdmin();
  if (!admin) {
    console.error("endConversation called without an authenticated admin");
    return;
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("conversations")
    .update({ status: "closed", claimed_by: null, claimed_at: null, needs_human: false })
    .eq("id", conversationId)
    .eq("business_id", businessId);

  if (error) {
    console.error("endConversation: update failed", error);
    return;
  }

  await logActivity(
    businessId,
    "conversation",
    conversationId,
    "updated",
    `${admin.email} ended conversation`,
    "admin_ui",
  );

  revalidatePath(`/admin/businesses/${businessId}/conversations/${conversationId}`);
  revalidatePath(`/admin/businesses/${businessId}/conversations`);
}
