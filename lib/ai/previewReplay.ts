import type { SupabaseClient } from "@supabase/supabase-js";
import { buildBusinessContext, type PromptOverride } from "@/lib/ai/buildContext";
import { classifyIntent } from "@/lib/ai/classifyIntent";
import { composeReply, type ComposeHistoryMessage } from "@/lib/ai/composeReply";
import { loadPriorMessages } from "@/lib/chat/history";
import { isFrustrationSignal } from "@/lib/chat/handoff";
import { assessGrounding, type GroundingResult } from "@/lib/grounding/assess";
import { isDeliveryConfirmation } from "@/lib/orders/deliveryPhrase";

// ---------------------------------------------------------------------------
// Preview before publishing: replay real past customer messages against a
// DRAFT prompt and show how the answers would change.
//
// SAFETY CONTRACT -- this module is read-only by construction:
//   * It only ever READS (messages, assessments, feedback, business context).
//     It never inserts or updates anything, never records a reply, never flags
//     a conversation, never sends WhatsApp or email, never starts an order.
//     eslint.config.mjs forbids importing those modules from this file, and
//     previewReplay.test.ts fails if that ever changes.
//   * Replies are composed with composeReply() -- the same function the live
//     pipeline uses -- with tools disabled (no outbound URL fetches, no order
//     tool), and the draft is applied through buildBusinessContext's
//     promptOverride, which bypasses the shared context cache.
//   * Nothing it produces is stored; results go straight back to the caller.
// ---------------------------------------------------------------------------

export const PREVIEW_TURN_LIMIT = 12;
const WINDOW_DAYS = 30;
const CANDIDATE_LIMIT = 150;

// Replies that did not come from the model's free-text path: canned handoff and
// "waiting for the team" messages, order recaps, delivery notices, human
// operator replies and system notices. There is nothing for a prompt to change.
const EXCLUDED_SNAPSHOT_KEYS = [
  "handoff",
  "paused",
  "orderRecap",
  "orderProblem",
  "orderFailed",
  "orderDelivered",
  "orderUpdate",
  "systemNotice",
  "operatorReply",
] as const;

export type PreviewTurn = {
  assistantMessageId: string;
  conversationId: string;
  createdAt: string;
  question: string;
  // Something already looked wrong with this reply (weak grounding or a thumbs-down).
  flagged: boolean;
};

type SideResult = { text: string; grounding: GroundingResult } | { error: string };

export type ReplayResult =
  | { skipped: string }
  | {
      question: string;
      oldReply: string;
      active: SideResult;
      draft: SideResult;
      changed: boolean;
    };

function isReplayable(snapshot: unknown): boolean {
  if (typeof snapshot !== "object" || snapshot === null) return true;
  const record = snapshot as Record<string, unknown>;
  return !EXCLUDED_SNAPSHOT_KEYS.some((key) => Boolean(record[key]));
}

// Customer messages that the live pipeline answers with a canned reply instead
// of calling the model: replaying them would show nothing about the prompt.
function bypassesModel(message: string): boolean {
  const intent = classifyIntent(message);
  return intent === "human_handoff" || intent === "prompt_injection" || isFrustrationSignal(message) || isDeliveryConfirmation(message);
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function normalizeForCompare(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Picks up to `limit` recent customer questions worth replaying. Replies that
 * already looked wrong (weak grounding, a thumbs-down) come first -- those are
 * where a better prompt matters most -- then the most recent others, with at
 * most two per conversation so one long chat can't crowd out the rest.
 *
 * Pass the signed-in user's client: row-level security keeps this to the
 * caller's own business even if businessId were tampered with.
 */
export async function selectPreviewTurns(
  supabase: SupabaseClient,
  businessId: string,
  limit: number = PREVIEW_TURN_LIMIT,
): Promise<PreviewTurn[]> {
  const { data: assistantRows, error } = await supabase
    .from("messages")
    .select("id, conversation_id, created_at, context_snapshot")
    .eq("business_id", businessId)
    .eq("role", "assistant")
    .gte("created_at", isoDaysAgo(WINDOW_DAYS))
    .order("created_at", { ascending: false })
    .limit(CANDIDATE_LIMIT);
  if (error || !assistantRows) return [];

  const candidates = assistantRows.filter((row) => isReplayable(row.context_snapshot));
  if (candidates.length === 0) return [];

  const candidateIds = candidates.map((row) => row.id);
  const [{ data: weak }, { data: thumbsDown }] = await Promise.all([
    supabase.from("message_assessments").select("message_id").in("message_id", candidateIds).in("verdict", ["low", "medium"]),
    supabase.from("message_feedback").select("message_id").in("message_id", candidateIds).eq("rating", "down"),
  ]);
  const flaggedIds = new Set([...(weak ?? []), ...(thumbsDown ?? [])].map((row) => row.message_id));

  // Replies that already looked wrong first, then the newest (the query above is newest-first).
  const ordered = [...candidates.filter((row) => flaggedIds.has(row.id)), ...candidates.filter((row) => !flaggedIds.has(row.id))];

  // Each reply's question is looked up on its own (the customer message right before it), never
  // from one bulk fetch of the conversations' messages: a bulk fetch has to be cut off somewhere,
  // and on a busy business whatever it cuts off is the NEWEST messages, so recent replies lost
  // their question or got an older one. Questions are resolved in small waves, in priority order,
  // so only about as many lookups run as it takes to fill `limit` turns.
  const perConversation = new Map<string, number>();
  const picked: PreviewTurn[] = [];
  let next = 0;
  while (picked.length < limit && next < ordered.length) {
    const wave: typeof ordered = [];
    while (next < ordered.length && wave.length < limit - picked.length) {
      const row = ordered[next++];
      if ((perConversation.get(row.conversation_id) ?? 0) < 2) wave.push(row);
    }
    const questions = await Promise.all(wave.map((row) => precedingCustomerMessage(supabase, businessId, row)));
    for (let i = 0; i < wave.length && picked.length < limit; i += 1) {
      const row = wave[i];
      const question = questions[i];
      if (!question || bypassesModel(question)) continue;
      const used = perConversation.get(row.conversation_id) ?? 0;
      if (used >= 2) continue;
      perConversation.set(row.conversation_id, used + 1);
      picked.push({
        assistantMessageId: row.id,
        conversationId: row.conversation_id,
        createdAt: row.created_at,
        question,
        flagged: flaggedIds.has(row.id),
      });
    }
  }
  return picked;
}

// The customer message immediately before an assistant reply in the same conversation. One row,
// so the answer doesn't depend on how many messages the conversation or the business has.
async function precedingCustomerMessage(
  supabase: SupabaseClient,
  businessId: string,
  reply: { conversation_id: string; created_at: string },
): Promise<string | null> {
  const { data, error } = await supabase
    .from("messages")
    .select("content")
    .eq("business_id", businessId)
    .eq("conversation_id", reply.conversation_id)
    .eq("role", "customer")
    .lt("created_at", reply.created_at)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error || !data || data.length === 0) return null;
  return typeof data[0].content === "string" ? data[0].content : null;
}

/**
 * Replays ONE past turn twice -- once with the prompt that is live now, once
 * with the draft -- using the same compose path as a real reply. Comparing the
 * draft to the live prompt (not just to the stored historical reply) matters:
 * the model isn't deterministic and the business info may have changed since,
 * so only draft-vs-live isolates the effect of the prompt change itself.
 */
export async function replayTurn(
  supabase: SupabaseClient,
  args: { businessId: string; assistantMessageId: string; draft: PromptOverride },
): Promise<ReplayResult> {
  const { businessId, assistantMessageId, draft } = args;

  const { data: assistant, error } = await supabase
    .from("messages")
    .select("id, role, content, conversation_id, created_at, context_snapshot")
    .eq("id", assistantMessageId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (error || !assistant || assistant.role !== "assistant") return { skipped: "That reply wasn't found." };
  if (!isReplayable(assistant.context_snapshot)) return { skipped: "That reply wasn't written by the AI." };

  const { data: customerMessage } = await supabase
    .from("messages")
    .select("content, created_at")
    .eq("conversation_id", assistant.conversation_id)
    .eq("business_id", businessId)
    .eq("role", "customer")
    .lt("created_at", assistant.created_at)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!customerMessage) return { skipped: "No customer message came before that reply." };
  if (bypassesModel(customerMessage.content)) return { skipped: "That message gets a standard reply, not an AI one." };

  const { data: priorRows } = await loadPriorMessages(supabase, assistant.conversation_id, { before: customerMessage.created_at });
  const history: ComposeHistoryMessage[] = (priorRows ?? []).map((row) => ({
    role: row.role === "customer" ? "customer" : "assistant",
    content: row.content,
  }));
  const customerTexts = [...history.filter((m) => m.role === "customer").map((m) => m.content), customerMessage.content];

  const [activeContext, draftContext] = await Promise.all([
    buildBusinessContext(businessId),
    buildBusinessContext(businessId, { promptOverride: draft }),
  ]);
  if (!activeContext.found || !draftContext.found) return { skipped: "This business isn't active." };

  async function run(context: typeof activeContext): Promise<SideResult> {
    try {
      const result = await composeReply({ context, history, message: customerMessage!.content, disableTools: true });
      const text = result.text || "";
      return {
        text,
        grounding: assessGrounding({
          reply: text,
          knowledge: context.contextText,
          customerMessages: customerTexts,
          businessName: context.business?.name ?? "",
          currency: context.business?.currency ?? "NGN",
        }),
      };
    } catch (runError) {
      // Never surface provider error text to the browser.
      console.error("previewReplay: compose failed:", runError);
      return { error: "The AI couldn't answer this one right now." };
    }
  }

  const [active, draftSide] = await Promise.all([run(activeContext), run(draftContext)]);
  const changed =
    "text" in active && "text" in draftSide ? normalizeForCompare(active.text) !== normalizeForCompare(draftSide.text) : false;

  return { question: customerMessage.content, oldReply: assistant.content, active, draft: draftSide, changed };
}
