import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveHandoff, takeOverConversation, handBackToAI, endConversation } from "../actions";
import { linkifyContent } from "@/lib/linkify";
import { ReplyForm } from "./ReplyForm";
import { LiveRefresh } from "./LiveRefresh";

type MessageContextSnapshot = {
  productImages?: { name: string; imageUrl: string }[];
  operatorReply?: boolean;
  systemNotice?: boolean;
};

export default async function ConversationThreadPage({
  params,
}: {
  params: Promise<{ businessId: string; conversationId: string }>;
}) {
  const { businessId, conversationId } = await params;
  const supabase = await createClient();

  // Defense in depth: re-check the conversation actually belongs to this
  // business, even though the URL already implies it -- same discipline
  // as the customer-facing /api/chat route.
  const { data: conversation } = await supabase
    .from("conversations")
    .select(
      "id, business_id, session_token, needs_human, channel, claimed_by, ended_by, customer_rating, customer_rating_emoji",
    )
    .eq("id", conversationId)
    .eq("business_id", businessId)
    .maybeSingle();

  if (!conversation) notFound();

  const { data: messages } = await supabase
    .from("messages")
    .select("id, role, content, context_snapshot, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  const resolveHandoffForConversation = resolveHandoff.bind(null, businessId, conversationId);
  const takeOverForConversation = takeOverConversation.bind(null, businessId, conversationId);
  const handBackForConversation = handBackToAI.bind(null, businessId, conversationId);
  const endForConversation = endConversation.bind(null, businessId, conversationId);

  const messageIds = (messages ?? []).map((m) => m.id);
  const { data: feedbackRows } = messageIds.length
    ? await supabase.from("message_feedback").select("message_id, rating").in("message_id", messageIds)
    : { data: [] as { message_id: string; rating: string }[] };

  const feedbackByMessage = new Map((feedbackRows ?? []).map((f) => [f.message_id, f.rating]));

  const isClaimed = Boolean(conversation.claimed_by);

  return (
    <div>
      <LiveRefresh />
      <Link href={`/admin/businesses/${businessId}/conversations`} className="text-sm text-slate-500 hover:underline">
        ← All conversations
      </Link>
      <h1 className="mb-2 mt-2 flex items-center gap-2 text-xl font-semibold">
        Conversation <span className="font-mono text-sm text-slate-400">{conversation.session_token.slice(0, 8)}…</span>
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
      </h1>

      {conversation.needs_human && !isClaimed && (
        <div className="mb-6 flex items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
          <p className="text-sm font-medium text-amber-800">
            🚩 This customer asked for a person (or Mira got stuck) — take over when you&apos;re ready.
          </p>
          <div className="flex flex-shrink-0 gap-2">
            <form action={resolveHandoffForConversation}>
              <button
                type="submit"
                className="rounded border border-amber-400 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100"
              >
                Dismiss
              </button>
            </form>
            <form action={takeOverForConversation}>
              <button
                type="submit"
                className="rounded bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
              >
                Take over
              </button>
            </form>
          </div>
        </div>
      )}

      {isClaimed && (
        <div className="mb-6 flex items-center justify-between gap-3 rounded-lg border border-sky-300 bg-sky-50 px-4 py-3">
          <p className="text-sm font-medium text-sky-800">
            👤 {conversation.claimed_by} is handling this conversation — Mira is silent until it&apos;s handed back or ended.
          </p>
          <div className="flex flex-shrink-0 gap-2">
            <form action={handBackForConversation}>
              <button
                type="submit"
                className="rounded border border-sky-400 bg-white px-3 py-1.5 text-xs font-medium text-sky-800 hover:bg-sky-100"
              >
                Hand back to Mira
              </button>
            </form>
            <form action={endForConversation}>
              <button
                type="submit"
                className="rounded bg-slate-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
              >
                End conversation
              </button>
            </form>
          </div>
        </div>
      )}

      {!conversation.needs_human && !isClaimed && <div className="mb-6" />}

      <div className="space-y-3">
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
                {isOperatorReply && <span className="mr-2 font-medium text-sky-600">Team reply</span>}
                {new Date(m.created_at).toLocaleTimeString()}
                {feedbackByMessage.get(m.id) === "up" && <span className="ml-2 text-emerald-600">👍 helpful</span>}
                {feedbackByMessage.get(m.id) === "down" && <span className="ml-2 text-red-500">👎 not helpful</span>}
              </p>
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
