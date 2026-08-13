import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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
    .select("id, business_id, session_token")
    .eq("id", conversationId)
    .eq("business_id", businessId)
    .maybeSingle();

  if (!conversation) notFound();

  const { data: messages } = await supabase
    .from("messages")
    .select("id, role, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  const messageIds = (messages ?? []).map((m) => m.id);
  const { data: feedbackRows } = messageIds.length
    ? await supabase.from("message_feedback").select("message_id, rating").in("message_id", messageIds)
    : { data: [] as { message_id: string; rating: string }[] };

  const feedbackByMessage = new Map((feedbackRows ?? []).map((f) => [f.message_id, f.rating]));

  return (
    <div>
      <Link href={`/admin/businesses/${businessId}/conversations`} className="text-sm text-slate-500 hover:underline">
        ← All conversations
      </Link>
      <h1 className="mb-6 mt-2 text-xl font-semibold">
        Conversation <span className="font-mono text-sm text-slate-400">{conversation.session_token.slice(0, 8)}…</span>
      </h1>

      <div className="space-y-3">
        {messages?.map((m) => (
          <div key={m.id} className={m.role === "customer" ? "text-right" : "text-left"}>
            <span
              className={
                m.role === "customer"
                  ? "inline-block max-w-[85%] rounded-lg bg-accent px-3 py-2 text-sm text-white"
                  : "inline-block max-w-[85%] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              }
            >
              {m.content}
            </span>
            <p className="mt-0.5 text-xs text-slate-400">
              {new Date(m.created_at).toLocaleTimeString()}
              {feedbackByMessage.get(m.id) === "up" && <span className="ml-2 text-emerald-600">👍 helpful</span>}
              {feedbackByMessage.get(m.id) === "down" && <span className="ml-2 text-red-500">👎 not helpful</span>}
            </p>
          </div>
        ))}
        {(!messages || messages.length === 0) && (
          <p className="text-sm text-slate-500">No messages in this conversation.</p>
        )}
      </div>
    </div>
  );
}
