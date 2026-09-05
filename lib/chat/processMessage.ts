import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { buildBusinessContext } from "@/lib/ai/buildContext";
import { buildSystemPrompt, buildMessages, isFallbackReply } from "@/lib/ai/buildPrompt";
import { classifyIntent } from "@/lib/ai/classifyIntent";
import { generateReply } from "@/lib/ai/generateReply";
import { getOfflineGateReply } from "@/lib/chat/offlineReply";
import { getHandoffReply, getPausedReply, isFrustrationSignal, type HandoffReason } from "@/lib/chat/handoff";
import { matchProductImages, type ProductImageRef } from "@/lib/chat/matchProductImages";
import { recordProductInterest } from "@/lib/chat/recordProductInterest";
import { CONVERSATION_IDLE_TIMEOUT_MS } from "@/lib/chat/conversation";

export class ProcessMessageError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export type ProcessMessageResult = {
  reply: string;
  messageId: string;
  productImages: ProductImageRef[];
};

export async function processMessage(
  businessId: string,
  sessionToken: string,
  message: string,
  channel: "web" | "whatsapp" = "web"
): Promise<ProcessMessageResult> {
  const supabase = createServiceRoleClient();
  const trimmedMessage = message.trim();

  let { data: conversation, error: conversationLookupError } = await supabase
    .from("conversations")
    .select("id, business_id, last_message_at, needs_human")
    .eq("business_id", businessId)
    .eq("session_token", sessionToken)
    .eq("status", "open")
    .maybeSingle();

  if (conversationLookupError) {
    console.error("Conversation lookup failed:", conversationLookupError);
    throw new ProcessMessageError("Something went wrong. Please try again.", 500);
  }

  if (
    conversation &&
    Date.now() - new Date(conversation.last_message_at).getTime() >= CONVERSATION_IDLE_TIMEOUT_MS
  ) {
    const { error: closeError } = await supabase
      .from("conversations")
      .update({ status: "closed" })
      .eq("id", conversation.id)
      .eq("status", "open");

    if (closeError) {
      console.error("Expired conversation close failed:", closeError);
      throw new ProcessMessageError("Something went wrong. Please try again.", 500);
    }

    conversation = null;
  }

  let isNewConversation = false;

  if (!conversation) {
    const { data: newConversation, error: convError } = await supabase
      .from("conversations")
      .insert({
        business_id: businessId,
        session_token: sessionToken,
        channel,
        last_message_at: new Date().toISOString(),
      })
      .select("id, business_id, last_message_at, needs_human")
      .single();

    if (convError?.code === "23505") {
      // Lost the race to open this conversation; pick up the winner's row.
      const { data: winner, error: reselectError } = await supabase
        .from("conversations")
        .select("id, business_id, last_message_at, needs_human")
        .eq("business_id", businessId)
        .eq("session_token", sessionToken)
        .eq("status", "open")
        .single();

      if (reselectError || !winner) {
        console.error("Conversation re-select after race lost failed:", reselectError);
        throw new ProcessMessageError("Could not start conversation.", 500);
      }
      conversation = winner;
    } else if (convError || !newConversation) {
      console.error("Conversation creation failed:", convError);
      throw new ProcessMessageError("Could not start conversation.", 500);
    } else {
      conversation = newConversation;
      isNewConversation = true;
    }
  }

  if (!conversation) {
    throw new ProcessMessageError("Could not start conversation.", 500);
  }

  if (conversation.business_id !== businessId) {
    throw new ProcessMessageError("Conversation does not belong to this business.", 403);
  }

  const { data: priorMessages, error: priorMessagesError } = await supabase
    .from("messages")
    .select("role, content")
    .eq("conversation_id", conversation.id)
    .order("created_at", { ascending: true })
    .limit(20);

  if (priorMessagesError) {
    console.error("Prior messages fetch failed:", priorMessagesError);
  }

  const { error: customerInsertError } = await supabase.from("messages").insert({
    conversation_id: conversation.id,
    business_id: businessId,
    role: "customer",
    content: trimmedMessage,
  });

  if (customerInsertError) {
    console.error("Customer message insert failed:", customerInsertError);
    throw new ProcessMessageError("Something went wrong. Please try again.", 500);
  }

  // Only the opener of a brand-new conversation can get the instant
  // closed-hours reply. An ongoing conversation always goes through the
  // real pipeline below, which is already hours-aware via buildContext.
  if (isNewConversation) {
    const offlineReply = await getOfflineGateReply(supabase, businessId);
    if (offlineReply) {
      const { data: saved, error: offlineInsertError } = await supabase
        .from("messages")
        .insert({
          conversation_id: conversation.id,
          business_id: businessId,
          role: "assistant",
          content: offlineReply,
          context_snapshot: { offlineGate: true },
        })
        .select("id")
        .single();

      if (offlineInsertError || !saved) {
        console.error("Offline reply insert failed:", offlineInsertError);
        throw new ProcessMessageError("Something went wrong. Please try again.", 500);
      }

      await supabase
        .from("conversations")
        .update({ last_message_at: new Date().toISOString() })
        .eq("id", conversation.id);

      return { reply: offlineReply, messageId: saved.id, productImages: [] };
    }
  }

  const context = await buildBusinessContext(businessId);
  const businessName = context.business?.name ?? "this business";

  // If an earlier message already flagged this conversation for a human,
  // stay paused: don't classify intent or generate a fresh AI reply for
  // ANY new customer message, no matter what it says. This is the fix
  // for a real bug -- previously every message was independently
  // re-evaluated by intent/frustration/repeated-fallback heuristics, so
  // a plain, answerable follow-up question could still land back in the
  // handoff branch (or slip past it) depending on what the last couple
  // of replies happened to look like. Only resolving the handoff (an
  // operator marks it resolved) lifts this pause.
  if (conversation.needs_human) {
    const waitingReply = getPausedReply(businessName);
    const { data: saved, error: pausedInsertError } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversation.id,
        business_id: businessId,
        role: "assistant",
        content: waitingReply,
        context_snapshot: { handoff: true, paused: true },
      })
      .select("id")
      .single();

    if (pausedInsertError || !saved) {
      console.error("Paused-conversation reply insert failed:", pausedInsertError);
      throw new ProcessMessageError("Something went wrong. Please try again.", 500);
    }

    await supabase
      .from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conversation.id);

    return { reply: waitingReply, messageId: saved.id, productImages: [] };
  }

  const intent = classifyIntent(trimmedMessage);

  // "Repeated confusion" half of the handoff trigger: either the customer
  // sounds frustrated right now, or Mira has already given the canned
  // "I don't have that information" fallback twice in a row -- two
  // different signals for the same underlying thing, that this
  // conversation isn't going anywhere without a person.
  const recentAssistantReplies = (priorMessages ?? [])
    .filter((m) => m.role === "assistant")
    .slice(-2)
    .map((m) => m.content);
  const repeatedFallback =
    recentAssistantReplies.length === 2 &&
    recentAssistantReplies.every((text) => isFallbackReply(text, businessName));
  const needsHandoff =
    intent === "human_handoff" || repeatedFallback || isFrustrationSignal(trimmedMessage);

  if (needsHandoff) {
    // Flip false -> true and report whether THIS call is the one that did
    // it, in one round trip -- zero rows back means a concurrent request
    // won the race and flagged it first (we already know needs_human was
    // false as of our SELECT above, so a real flagError here is a genuine
    // write failure, not just "already flagged").
    const { data: flaggedRows, error: flagError } = await supabase
      .from("conversations")
      .update({ needs_human: true })
      .eq("id", conversation.id)
      .eq("needs_human", false)
      .select("id");

    if (flagError) {
      // Don't tell the customer a human is now on this if we couldn't
      // actually record that -- nobody would ever see it flagged on the
      // business side, so promising a handoff here would be a lie the
      // customer has no way to know about. Fail loudly instead.
      console.error("Failed to flag conversation for human handoff:", flagError);
      throw new ProcessMessageError("Something went wrong. Please try again.", 500);
    }

    const alreadyFlagged = (flaggedRows?.length ?? 0) === 0;
    const reason: HandoffReason = intent === "human_handoff" ? "requested" : "confused";
    const handoffText = getHandoffReply(businessName, reason, alreadyFlagged);

    const { data: savedHandoff, error: handoffInsertError } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversation.id,
        business_id: businessId,
        role: "assistant",
        content: handoffText,
        context_snapshot: { handoff: true, reason },
      })
      .select("id")
      .single();

    if (handoffInsertError || !savedHandoff) {
      console.error("Handoff reply insert failed:", handoffInsertError);
      throw new ProcessMessageError("Something went wrong. Please try again.", 500);
    }

    await supabase
      .from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conversation.id);

    return { reply: handoffText, messageId: savedHandoff.id, productImages: [] };
  }


  const systemPrompt = buildSystemPrompt(context);
  const history = (priorMessages ?? []).map((m) => ({
    role: m.role as "customer" | "assistant",
    content: m.content,
  }));
  const llmMessages = buildMessages(history, trimmedMessage);

  // Mirrors the duplicated pipeline in app/api/chat/route.ts (the web
  // widget) apart from streaming -- see the comment there for why a
  // straight call-through between the two isn't safe yet. Keep this catch
  // in sync with that one: never let err.message reach
  // ProcessMessageError.message. Today the only caller (the WhatsApp
  // webhook) discards it and substitutes its own generic reply anyway, but
  // .status exists on this class for a future caller that maps
  // status/message straight onto an HTTP response -- and generateReply()'s
  // errors can be a missing-env-var name or a raw provider error body (see
  // lib/ai/generateReply.ts). The real error is already fully logged
  // above, so nothing is lost by keeping it out of the thrown message.
  let replyText: string;
  try {
    replyText = await generateReply(systemPrompt, llmMessages);
  } catch (err) {
    console.error("generateReply failed:", err);
    throw new ProcessMessageError("The assistant is unavailable right now.", 502);
  }

  const productImages = matchProductImages(replyText, context.products);
  await recordProductInterest(supabase, businessId, sessionToken, productImages);

  // Insert now selects the row back (previously fire-and-forget) --
  // deliberate change: feedback (thumbs up/down) needs a real message id
  // to attach to, so a failed write has to be a hard error now rather
  // than a reply the customer sees that doesn't actually exist anywhere.
  const { data: savedAssistantMessage, error: assistantInsertError } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversation.id,
      business_id: businessId,
      role: "assistant",
      content: replyText,
      context_snapshot: { systemPrompt, productImages },
    })
    .select("id")
    .single();

  if (assistantInsertError || !savedAssistantMessage) {
    console.error("Assistant message insert failed:", assistantInsertError);
    throw new ProcessMessageError("Something went wrong. Please try again.", 500);
  }

  const { error: timestampError } = await supabase
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conversation.id);

  if (timestampError) {
    console.error("Conversation timestamp update failed:", timestampError);
  }

  return { reply: replyText, messageId: savedAssistantMessage.id, productImages };
}
