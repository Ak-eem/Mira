"use server";

import { revalidatePath } from "next/cache";
import { getCurrentBusinessOwner } from "@/lib/supabase/portal-auth";
import { createClient } from "@/lib/supabase/server";
import { clearHandoff } from "@/lib/chat/clearHandoff";
import { closeConversation } from "@/lib/chat/closeConversation";
import { sendWhatsappReply } from "@/lib/whatsapp/sendMessage";
import { MAX_FEEDBACK_NOTE_LENGTH, isFeedbackReason, type FeedbackReason } from "@/lib/feedback/reasons";

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
  const { error } = await clearHandoff(supabase, { businessId, conversationId, releaseClaim: false });

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
    .select("id, session_token, channel, claimed_by")
    .eq("id", conversationId)
    .eq("business_id", businessId)
    .maybeSingle();

  if (convError || !conversation) {
    console.error("replyToConversation (portal): conversation lookup failed", convError);
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

// Mirrors the admin panel's takeOverConversation -- see that file for
// the full reasoning, including why the update is conditioned on
// claimed_by IS NULL (atomic takeover, no operator races).
export async function takeOverConversation(businessId: string, conversationId: string): Promise<void> {
  const owner = await getCurrentBusinessOwner();
  if (!owner || !owner.businesses.some((b) => b.id === businessId)) {
    console.error("takeOverConversation (portal) called without an authorized owner");
    return;
  }

  const supabase = await createClient();

  const { data: claimed, error } = await supabase
    .from("conversations")
    .update({ claimed_by: owner.email, claimed_at: new Date().toISOString() })
    .eq("id", conversationId)
    .eq("business_id", businessId)
    .is("claimed_by", null)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("takeOverConversation (portal): update failed", error);
    return;
  }

  if (!claimed) {
    revalidatePath(`/portal/${businessId}/conversations/${conversationId}`);
    revalidatePath(`/portal/${businessId}/conversations`);
    return;
  }

  const { error: noticeError } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    business_id: businessId,
    role: "assistant",
    content: `${owner.email} took over this conversation.`,
    context_snapshot: { systemNotice: true },
  });

  if (noticeError) {
    console.error("takeOverConversation (portal): system notice insert failed", noticeError);
  }

  revalidatePath(`/portal/${businessId}/conversations/${conversationId}`);
  revalidatePath(`/portal/${businessId}/conversations`);
}

// Mirrors the admin panel's handBackToAI.
export async function handBackToAI(businessId: string, conversationId: string): Promise<void> {
  const owner = await getCurrentBusinessOwner();
  if (!owner || !owner.businesses.some((b) => b.id === businessId)) {
    console.error("handBackToAI (portal) called without an authorized owner");
    return;
  }

  const supabase = await createClient();

  const { error } = await clearHandoff(supabase, { businessId, conversationId, releaseClaim: true });

  if (error) {
    console.error("handBackToAI (portal): update failed", error);
    return;
  }

  const { error: noticeError } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    business_id: businessId,
    role: "assistant",
    content: `${owner.email} handed the conversation back to Mira.`,
    context_snapshot: { systemNotice: true },
  });

  if (noticeError) {
    console.error("handBackToAI (portal): system notice insert failed", noticeError);
  }

  revalidatePath(`/portal/${businessId}/conversations/${conversationId}`);
  revalidatePath(`/portal/${businessId}/conversations`);
}

// Mirrors the admin panel's endConversation.
export async function endConversation(businessId: string, conversationId: string): Promise<void> {
  const owner = await getCurrentBusinessOwner();
  if (!owner || !owner.businesses.some((b) => b.id === businessId)) {
    console.error("endConversation (portal) called without an authorized owner");
    return;
  }

  const supabase = await createClient();

  const { error } = await closeConversation(supabase, { conversationId, businessId, endedBy: "operator" });

  if (error) {
    console.error("endConversation (portal): update failed", error);
    return;
  }

  revalidatePath(`/portal/${businessId}/conversations/${conversationId}`);
  revalidatePath(`/portal/${businessId}/conversations`);
}

// ---------------------------------------------------------------------------
// Staff review of one of Mira's replies (the business's side of feedback).
//
// Any team member (owner or staff) may review. The database enforces the same
// thing independently via the "members ... staff review" policies on
// message_feedback, so this check is a second layer, not the only one. It
// also re-verifies, against the conversation the person is looking at, that
// the message is genuinely one of Mira's own replies -- not a customer
// message, a human operator's reply, or a system notice.
// ---------------------------------------------------------------------------

type ReviewTarget = { businessId: string; conversationId: string; messageId: string };

async function loadReviewableMessage(target: ReviewTarget) {
  const owner = await getCurrentBusinessOwner();
  if (!owner || !owner.businesses.some((b) => b.id === target.businessId)) {
    return { ok: false as const, error: "Not authorized for this business." };
  }

  const supabase = await createClient();
  const { data: message, error } = await supabase
    .from("messages")
    .select("id, role, context_snapshot")
    .eq("id", target.messageId)
    .eq("conversation_id", target.conversationId)
    .eq("business_id", target.businessId)
    .maybeSingle();

  if (error) {
    console.error("Review: message lookup failed:", error);
    return { ok: false as const, error: "Couldn't load that reply." };
  }
  const snapshot = (message?.context_snapshot ?? null) as { operatorReply?: boolean; systemNotice?: boolean } | null;
  if (!message || message.role !== "assistant" || snapshot?.operatorReply || snapshot?.systemNotice) {
    return { ok: false as const, error: "Only Mira's own replies can be reviewed." };
  }
  return { ok: true as const, supabase, owner };
}

export async function saveReplyReview(
  input: ReviewTarget & { rating: "up" | "down"; reason: string | null; note: string | null },
): Promise<{ error: string | null }> {
  if (input.rating !== "up" && input.rating !== "down") return { error: "Invalid rating." };

  let reason: FeedbackReason | null = null;
  if (input.rating === "down") {
    if (!isFeedbackReason(input.reason)) return { error: "Pick what was wrong with the reply." };
    reason = input.reason;
  }
  const note = typeof input.note === "string" ? input.note.trim().slice(0, MAX_FEEDBACK_NOTE_LENGTH) : "";

  const loaded = await loadReviewableMessage(input);
  if (!loaded.ok) return { error: loaded.error };

  const { error } = await loaded.supabase.from("message_feedback").upsert(
    {
      message_id: input.messageId,
      source: "staff",
      rating: input.rating,
      reason,
      note: note || null,
      reviewer_id: loaded.owner.userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "message_id,source" },
  );
  if (error) {
    console.error("Review: save failed:", error);
    return { error: "Couldn't save that review." };
  }

  revalidatePath(`/portal/${input.businessId}/conversations/${input.conversationId}`);
  return { error: null };
}

export async function clearReplyReview(target: ReviewTarget): Promise<{ error: string | null }> {
  const loaded = await loadReviewableMessage(target);
  if (!loaded.ok) return { error: loaded.error };

  const { error } = await loaded.supabase
    .from("message_feedback")
    .delete()
    .eq("message_id", target.messageId)
    .eq("source", "staff");
  if (error) {
    console.error("Review: clear failed:", error);
    return { error: "Couldn't clear that review." };
  }

  revalidatePath(`/portal/${target.businessId}/conversations/${target.conversationId}`);
  return { error: null };
}
