import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { buildBusinessContext } from "@/lib/ai/buildContext";
import { buildSystemPrompt, buildMessages, isFallbackReply } from "@/lib/ai/buildPrompt";
import { classifyIntent } from "@/lib/ai/classifyIntent";
import { generateReplyWithMetadata } from "@/lib/ai/generateReply";
import { recordAiResponseTelemetry } from "@/lib/analytics/recordTelemetry";
import { after } from "next/server";
import { getOfflineGateReply } from "@/lib/chat/offlineReply";
import { getHandoffReply, getPausedReply, isFrustrationSignal, type HandoffReason } from "@/lib/chat/handoff";
import { matchProductImages, type ProductImageRef } from "@/lib/chat/matchProductImages";
import { CONVERSATION_IDLE_TIMEOUT_MS } from "@/lib/chat/conversation";
import { replyKeyFor } from "@/lib/chat/inboundKey";

export class ProcessMessageError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export type ProcessMessageResult = {
  reply: string;
  messageId: string | null;
  productImages: ProductImageRef[];
  silent?: boolean;
};

type SupabaseClient = ReturnType<typeof createServiceRoleClient>;

type RecordedReply = { messageId: string; newlyFlagged: boolean };

/**
 * Inserts an assistant message (optionally flipping needs_human) and bumps
 * conversations.last_message_at in a single database transaction. Idempotent
 * on inboundKey: a second call with the same key returns the existing row.
 */
async function recordAssistantReply(
  supabase: SupabaseClient,
  args: {
    conversationId: string;
    businessId: string;
    content: string;
    snapshot: Record<string, unknown>;
    inboundKey: string | null;
    flagHandoff?: boolean;
    interestProductIds?: string[];
    customerIdentifier?: string;
  },
): Promise<{ data: RecordedReply | null; error: unknown }> {
  const { data, error } = await supabase.rpc("record_assistant_reply", {
    p_conversation_id: args.conversationId,
    p_business_id: args.businessId,
    p_content: args.content,
    p_snapshot: args.snapshot,
    p_inbound_key: args.inboundKey,
    p_flag_handoff: args.flagHandoff ?? false,
    p_interest_product_ids: args.interestProductIds?.length ? args.interestProductIds : null,
    p_customer_identifier: args.customerIdentifier ?? null,
  });
  if (error) return { data: null, error };
  const row = (Array.isArray(data) ? data[0] : data) as { message_id?: string; newly_flagged?: boolean } | null | undefined;
  if (!row?.message_id) return { data: null, error: new Error("record_assistant_reply returned no row") };
  return { data: { messageId: row.message_id, newlyFlagged: Boolean(row.newly_flagged) }, error: null };
}

/** The reply already recorded for a previous attempt at this inbound message, if any. */
async function findRecordedReply(
  supabase: SupabaseClient,
  businessId: string,
  replyKey: string,
): Promise<ProcessMessageResult | null> {
  const { data, error } = await supabase
    .from("messages")
    .select("id, content, context_snapshot")
    .eq("business_id", businessId)
    .eq("inbound_key", replyKey)
    .maybeSingle();
  if (error) {
    console.error("Recorded reply lookup failed:", error);
    throw new ProcessMessageError("Something went wrong. Please try again.", 500);
  }
  if (!data) return null;
  const snapshot = data.context_snapshot as { productImages?: ProductImageRef[] } | null;
  return { reply: data.content, messageId: data.id, productImages: snapshot?.productImages ?? [] };
}

export async function processMessage(
  businessId: string,
  sessionToken: string,
  message: string,
  channel: "web" | "whatsapp" | "email" = "web",
  // Stable id of the inbound provider message (WhatsApp message id, email id).
  // When set, every write is idempotent on it: a retry of the same inbound
  // message reuses the already-saved customer row and the already-recorded
  // reply instead of duplicating them or generating a second AI answer.
  inboundKey?: string,
): Promise<ProcessMessageResult> {
  const supabase = createServiceRoleClient();
  const trimmedMessage = message.trim();
  const replyKey = inboundKey ? replyKeyFor(inboundKey) : null;

  if (inboundKey && replyKey) {
    const existing = await findRecordedReply(supabase, businessId, replyKey);
    if (existing) return existing;
  }

  let { data: conversation, error: conversationLookupError } = await supabase
    .from("conversations")
    .select("id, business_id, last_message_at, needs_human, claimed_by")
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
      .select("id, business_id, last_message_at, needs_human, claimed_by")
      .single();

    if (convError?.code === "23505") {
      // Lost the race to open this conversation; pick up the winner's row.
      const { data: winner, error: reselectError } = await supabase
        .from("conversations")
        .select("id, business_id, last_message_at, needs_human, claimed_by")
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

  const { data: allPriorMessages, error: priorMessagesError } = await supabase
    .from("messages")
    .select("role, content, inbound_key")
    .eq("conversation_id", conversation.id)
    .order("created_at", { ascending: true })
    .limit(20);

  if (priorMessagesError) {
    console.error("Prior messages fetch failed:", priorMessagesError);
  }

  // A previous attempt at this same inbound message may already have saved
  // the customer row; it must not appear twice in the LLM history either.
  const priorMessages = (allPriorMessages ?? []).filter(
    (m) => !inboundKey || m.inbound_key !== inboundKey,
  );

  const { error: customerInsertError } = await supabase.from("messages").insert({
    conversation_id: conversation.id,
    business_id: businessId,
    role: "customer",
    content: trimmedMessage,
    inbound_key: inboundKey ?? null,
  });

  // 23505 on inbound_key = an earlier attempt already saved this exact message.
  if (customerInsertError && !(inboundKey && customerInsertError.code === "23505")) {
    console.error("Customer message insert failed:", customerInsertError);
    throw new ProcessMessageError("Something went wrong. Please try again.", 500);
  }

  // Only the opener of a brand-new conversation can get the instant
  // closed-hours reply. An ongoing conversation always goes through the
  // real pipeline below, which is already hours-aware via buildContext.
  if (isNewConversation) {
    const offlineReply = await getOfflineGateReply(supabase, businessId);
    if (offlineReply) {
      const { data: saved, error: offlineInsertError } = await recordAssistantReply(supabase, {
        conversationId: conversation.id,
        businessId,
        content: offlineReply,
        snapshot: { offlineGate: true },
        inboundKey: replyKey,
      });

      if (offlineInsertError || !saved) {
        console.error("Offline reply insert failed:", offlineInsertError);
        throw new ProcessMessageError("Something went wrong. Please try again.", 500);
      }

      return { reply: offlineReply, messageId: saved.messageId, productImages: [] };
    }
  }

  const context = await buildBusinessContext(businessId);
  const businessName = context.business?.name ?? "this business";

  // If an operator has explicitly claimed this conversation, Mira stays
  // completely silent -- the customer's message was already saved above,
  // the operator sees it, but no automated reply of any kind goes back.
  // This is deliberately different from the "flagged but not yet
  // claimed" case below, which still gets a polite acknowledgment --
  // once a human is actually on it, an automated reply on top of that
  // would be confusing.
  if (conversation.claimed_by) {
    await supabase
      .from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conversation.id);

    return { reply: "", messageId: null, productImages: [], silent: true };
  }

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
    const { data: saved, error: pausedInsertError } = await recordAssistantReply(supabase, {
      conversationId: conversation.id,
      businessId,
      content: waitingReply,
      snapshot: { handoff: true, paused: true },
      inboundKey: replyKey,
    });

    if (pausedInsertError || !saved) {
      console.error("Paused-conversation reply insert failed:", pausedInsertError);
      throw new ProcessMessageError("Something went wrong. Please try again.", 500);
    }

    return { reply: waitingReply, messageId: saved.messageId, productImages: [] };
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
    // The needs_human flip, the handoff message and the last_message_at bump
    // now happen in ONE transaction (record_assistant_reply). Previously the
    // flag flipped first, so a failed message insert left the conversation
    // flagged with no reply, and the retry then saw "already flagged" and
    // sent the wrong wording. needs_human was false as of our SELECT above
    // (the paused branch already returned otherwise), and the per-conversation
    // lease serializes webhook callers, so this call is the one that flags it.
    const reason: HandoffReason = intent === "human_handoff" ? "requested" : "confused";
    const handoffText = getHandoffReply(businessName, reason, false);

    const { data: savedHandoff, error: handoffInsertError } = await recordAssistantReply(supabase, {
      conversationId: conversation.id,
      businessId,
      content: handoffText,
      snapshot: { handoff: true, reason },
      inboundKey: replyKey,
      flagHandoff: true,
    });

    if (handoffInsertError || !savedHandoff) {
      // Nothing was flagged and nothing was saved -- the transaction rolled
      // back as one, so it's safe not to promise the customer a handoff.
      console.error("Handoff reply insert failed:", handoffInsertError);
      throw new ProcessMessageError("Something went wrong. Please try again.", 500);
    }

    return { reply: handoffText, messageId: savedHandoff.messageId, productImages: [] };
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
  let aiMetadata;
  const aiStartedAt = Date.now();
  try {
    const result = await generateReplyWithMetadata(systemPrompt, llmMessages);
    replyText = result.text;
    aiMetadata = result.metadata;
  } catch (err) {
    console.error("generateReply failed:", err);
    after(() => recordAiResponseTelemetry({
      businessId,
      conversationId: conversation.id,
      channel,
      success: false,
      latencyMs: Date.now() - aiStartedAt,
      errorCode: err instanceof Error ? err.name : "unknown",
    }));
    throw new ProcessMessageError("The assistant is unavailable right now.", 502);
  }

  const productImages = matchProductImages(replyText, context.products);

  // Recorded atomically with the last_message_at bump. The insert still
  // selects the row back (feedback thumbs need a real message id), so a
  // failed write is a hard error rather than a reply that exists nowhere.
  const { data: savedAssistantMessage, error: assistantInsertError } = await recordAssistantReply(supabase, {
    conversationId: conversation.id,
    businessId,
    content: replyText,
    snapshot: { systemPrompt, productImages },
    inboundKey: replyKey,
    // Written in the same transaction as the reply, so a retry can never
    // record the same interest twice.
    interestProductIds: productImages.map((p) => p.productId),
    customerIdentifier: sessionToken,
  });

  if (assistantInsertError || !savedAssistantMessage) {
    console.error("Assistant message insert failed:", assistantInsertError);
    throw new ProcessMessageError("Something went wrong. Please try again.", 500);
  }

  after(() => recordAiResponseTelemetry({
    businessId,
    conversationId: conversation.id,
    messageId: savedAssistantMessage.messageId,
    channel,
    success: true,
    latencyMs: Date.now() - aiStartedAt,
    metadata: aiMetadata,
  }));

  return { reply: replyText, messageId: savedAssistantMessage.messageId, productImages };
}
