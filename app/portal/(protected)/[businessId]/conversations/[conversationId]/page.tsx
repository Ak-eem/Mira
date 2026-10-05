import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveHandoff, takeOverConversation, handBackToAI, endConversation } from "../actions";
import { linkifyContent } from "@/lib/linkify";
import { ReplyForm } from "./ReplyForm";
import { LiveRefresh } from "./LiveRefresh";
import { ReplyReview } from "./ReplyReview";
import { describeSignal, type GroundingSignal } from "@/lib/grounding/assess";

type MessageContextSnapshot = {
  productImages?: { name: string; imageUrl: string }[];
  operatorReply?: boolean;
  systemNotice?: boolean;
};

export default async function PortalConversationThreadPage({
  params,
}: {
  params: Promise<{ businessId: string; conversationId: string }>;
}) {
  const { businessId, conversationId } = await params;
  const supabase = await createClient();

  const { data: conversation } = await supabase
    .from("conversations")
    .select(
      "id, business_id, session_token, needs_human, channel, claimed_by, ended_by, customer_rating, customer_rating_emoji",
    )
    .eq("id", conversationId)
    .eq("business_id", businessId)
    .maybeSingle();

  if (!conversation) notFound();

  // Marks this conversation viewed so the "Unread" indicator clears --
  // fire-and-forget, doesn't need to block the page render.
  void supabase.from("conversations").update({ last_viewed_at: new Date().toISOString() }).eq("id", conversationId);

  const { data: messages } = await supabase
    .from("messages")
    .select("id, role, content, context_snapshot, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  // Customer thumbs and staff reviews for this conversation's messages (one
  // row per message per source).
  const messageIds = (messages ?? []).map((m) => m.id);
  const { data: feedbackRows } = messageIds.length
    ? await supabase
        .from("message_feedback")
        .select("message_id, source, rating, reason, note")
        .in("message_id", messageIds)
    : { data: [] as { message_id: string; source: string; rating: "up" | "down"; reason: string | null; note: string | null }[] };
  // Grounding verdicts (absent until migration 0055 is applied -- then the
  // query just returns nothing and no badge is shown).
  const { data: assessmentRows } = messageIds.length
    ? await supabase.from("message_assessments").select("message_id, verdict, signals").in("message_id", messageIds)
    : { data: [] as { message_id: string; verdict: string; signals: GroundingSignal[] }[] };
  const assessments = new Map<string, { verdict: string; signals: GroundingSignal[] }>();
  for (const row of assessmentRows ?? []) assessments.set(row.message_id, { verdict: row.verdict, signals: row.signals ?? [] });

  const customerFeedback = new Map<string, { rating: "up" | "down"; reason: string | null }>();
  const staffReviews = new Map<string, { rating: "up" | "down"; reason: string | null; note: string | null }>();
  for (const row of feedbackRows ?? []) {
    if (row.source === "staff") staffReviews.set(row.message_id, { rating: row.rating, reason: row.reason, note: row.note });
    else customerFeedback.set(row.message_id, { rating: row.rating, reason: row.reason });
  }

  const resolveHandoffForConversation = resolveHandoff.bind(null, businessId, conversationId);
  const takeOverForConversation = takeOverConversation.bind(null, businessId, conversationId);
  const handBackForConversation = handBackToAI.bind(null, businessId, conversationId);
  const endForConversation = endConversation.bind(null, businessId, conversationId);

  const isClaimed = Boolean(conversation.claimed_by);

  return (
    <div>
      <LiveRefresh />
      <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold tracking-tight text-slate-900">
        Conversation <span className="font-mono text-sm font-normal text-slate-400">{conversation.session_token.slice(0, 8)}…</span>
        <span
          className={
            conversation.channel === "whatsapp"
              ? "rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700"
              : "rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600"
          }
        >
          {conversation.channel === "whatsapp" ? "WhatsApp" : "Web widget"}
        </span>
        {conversation.ended_by === "customer" && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
            Ended by customer
          </span>
        )}
        {conversation.customer_rating && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
            {conversation.customer_rating_emoji} {conversation.customer_rating}/5
          </span>
        )}
      </h2>

      {conversation.needs_human && !isClaimed && (
        <div className="mb-6 flex flex-col gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 shadow-xs sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-medium text-amber-800">
            🚩 This customer asked for a person (or Mira got stuck) — take over when you&apos;re ready.
          </p>
          <div className="flex shrink-0 gap-2">
            <form action={resolveHandoffForConversation}>
              <button
                type="submit"
                className="rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 transition hover:bg-amber-100"
              >
                Dismiss
              </button>
            </form>
            <form action={takeOverForConversation}>
              <button
                type="submit"
                className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-amber-700"
              >
                Take over
              </button>
            </form>
          </div>
        </div>
      )}

      {isClaimed && (
        <div className="mb-6 flex flex-col gap-3 rounded-xl border border-sky-300 bg-sky-50 px-4 py-3 shadow-xs sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-medium text-sky-800">
            👤 {conversation.claimed_by} is handling this conversation — Mira is silent until it&apos;s handed back or ended.
          </p>
          <div className="flex shrink-0 gap-2">
            <form action={handBackForConversation}>
              <button
                type="submit"
                className="rounded-lg border border-sky-400 bg-white px-3 py-1.5 text-xs font-medium text-sky-800 transition hover:bg-sky-100"
              >
                Hand back to Mira
              </button>
            </form>
            <form action={endForConversation}>
              <button
                type="submit"
                className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-slate-800"
              >
                End conversation
              </button>
            </form>
          </div>
        </div>
      )}

      {!conversation.needs_human && !isClaimed && <div className="mb-6" />}

      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
        {messages?.map((m) => {
          const snapshot = m.context_snapshot as MessageContextSnapshot | null;

          if (snapshot?.systemNotice) {
            return (
              <div key={m.id} className="text-center">
                <span className="inline-block rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500">
                  {m.content}
                </span>
              </div>
            );
          }

          const productImages = m.role === "assistant" ? snapshot?.productImages ?? [] : [];
          const isOperatorReply = m.role === "assistant" && snapshot?.operatorReply === true;

          return (
            <div key={m.id} className={m.role === "customer" ? "text-right" : "text-left"}>
              <span
                className={
                  m.role === "customer"
                    ? "inline-block max-w-[85%] rounded-lg bg-accent px-3 py-2 text-sm text-white"
                    : isOperatorReply
                      ? "inline-block max-w-[85%] rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm"
                      : "inline-block max-w-[85%] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                }
              >
                {linkifyContent(m.content)}
              </span>

              {productImages.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {productImages.map((p) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={p.imageUrl}
                      src={p.imageUrl}
                      alt={p.name}
                      className="h-16 w-16 rounded-md border border-slate-200 object-cover"
                    />
                  ))}
                </div>
              )}

              <p className="mt-0.5 text-xs text-slate-400">
                {isOperatorReply && <span className="mr-2 font-medium text-sky-600">You replied</span>}
                {new Date(m.created_at).toLocaleTimeString()}
              </p>

              {m.role === "assistant" && assessments.get(m.id) && ["low", "medium"].includes(assessments.get(m.id)!.verdict) && (
                <p className={`mt-1 text-xs ${assessments.get(m.id)!.verdict === "low" ? "text-red-500" : "text-amber-600"}`}>
                  Grounding: {assessments.get(m.id)!.verdict}
                  {assessments.get(m.id)!.signals.filter((signal) => !signal.supported).length > 0 &&
                    ` — ${assessments.get(m.id)!.signals.filter((signal) => !signal.supported).map(describeSignal).join("; ")}`}
                </p>
              )}

              {m.role === "assistant" && !isOperatorReply && (
                <ReplyReview
                  businessId={businessId}
                  conversationId={conversationId}
                  messageId={m.id}
                  customer={customerFeedback.get(m.id) ?? null}
                  staff={staffReviews.get(m.id) ?? null}
                />
              )}
            </div>
          );
        })}
        {(!messages || messages.length === 0) && (
          <p className="text-sm text-slate-500">No messages in this conversation.</p>
        )}
      </div>

      {isClaimed && <ReplyForm businessId={businessId} conversationId={conversationId} />}
    </div>
  );
}
