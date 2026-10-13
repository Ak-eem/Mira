import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { linkifyContent } from "@/lib/linkify";
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
      "id, business_id, session_token, needs_human, channel, claimed_by, ended_by, customer_rating, customer_rating_emoji, owner_read_at",
    )
    .eq("id", conversationId)
    .eq("business_id", businessId)
    .maybeSingle();

  if (!conversation) notFound();

  // Marks this conversation viewed so the "Unread" filter and the dot
  // in the list clear -- fire-and-forget, doesn't need to block the
  // page render on a write that has no bearing on what's shown here.
  void supabase.from("conversations").update({ last_viewed_at: new Date().toISOString() }).eq("id", conversationId);
  if (!conversation.owner_read_at) {
    await supabase
      .from("conversations")
      .update({ owner_read_at: new Date().toISOString() })
      .eq("id", conversationId)
      .eq("business_id", businessId)
      .is("owner_read_at", null);
  }

  const { data: messages } = await supabase
    .from("messages")
    .select("id, role, content, context_snapshot, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  const messageIds = (messages ?? []).map((m) => m.id);
  const { data: feedbackRows } = messageIds.length
    ? await supabase.from("message_feedback").select("message_id, source, rating, reason").in("message_id", messageIds)
    : { data: [] as { message_id: string; source: string; rating: string; reason: string | null }[] };

  // Up to two rows per message now: the customer's thumbs and a staff review.
  const customerFeedbackByMessage = new Map<string, { rating: string; reason: string | null }>();
  const staffReviewByMessage = new Map<string, { rating: string; reason: string | null }>();
  for (const f of feedbackRows ?? []) {
    (f.source === "staff" ? staffReviewByMessage : customerFeedbackByMessage).set(f.message_id, { rating: f.rating, reason: f.reason });
  }

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

      <p className="mb-6 rounded-lg border border-slate-200 bg-white/60 px-4 py-2.5 text-sm text-slate-600">
        Read-only view. Replying, taking over and ending conversations is done by the business owner; Mira answers automatically otherwise.
        {conversation.needs_human && !isClaimed && " This customer is waiting for a person."}
        {isClaimed && ` ${conversation.claimed_by} is handling it.`}
      </p>

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
                {customerFeedbackByMessage.get(m.id)?.rating === "up" && <span className="ml-2 text-emerald-600">👍 helpful</span>}
                {customerFeedbackByMessage.get(m.id)?.rating === "down" && (
                  <span className="ml-2 text-red-500">
                    👎 not helpful{customerFeedbackByMessage.get(m.id)?.reason ? ` (${customerFeedbackByMessage.get(m.id)?.reason})` : ""}
                  </span>
                )}
                {staffReviewByMessage.has(m.id) && (
                  <span className={staffReviewByMessage.get(m.id)?.rating === "down" ? "ml-2 text-red-500" : "ml-2 text-emerald-600"}>
                    Staff: {staffReviewByMessage.get(m.id)?.rating === "down" ? "needs work" : "good"}
                    {staffReviewByMessage.get(m.id)?.reason ? ` (${staffReviewByMessage.get(m.id)?.reason})` : ""}
                  </span>
                )}
              </p>
            </div>
          );
        })}
        {(!messages || messages.length === 0) && (
          <p className="text-sm text-slate-500">No messages in this conversation.</p>
        )}
      </div>

    </div>
  );
}

