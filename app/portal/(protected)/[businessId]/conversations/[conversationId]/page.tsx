import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveHandoff } from "../actions";
import { linkifyContent } from "@/lib/linkify";

type MessageContextSnapshot = {
  productImages?: { name: string; imageUrl: string }[];
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
    .select("id, business_id, session_token, needs_human")
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

  return (
    <div>
      <h2 className="mb-2 text-lg font-semibold tracking-tight text-slate-900">
        Conversation <span className="font-mono text-sm font-normal text-slate-400">{conversation.session_token.slice(0, 8)}…</span>
      </h2>

      {conversation.needs_human && (
        <form
          action={resolveHandoffForConversation}
          className="mb-6 flex items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 shadow-sm"
        >
          <p className="text-sm font-medium text-amber-800">
            🚩 This customer asked for a person (or Mira got stuck) — jump in when you&apos;re ready.
          </p>
          <button
            type="submit"
            className="flex-shrink-0 rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 transition hover:bg-amber-100"
          >
            Mark resolved
          </button>
        </form>
      )}
      {!conversation.needs_human && <div className="mb-6" />}

      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        {messages?.map((m) => {
          const productImages =
            m.role === "assistant"
              ? (m.context_snapshot as MessageContextSnapshot | null)?.productImages ?? []
              : [];

          return (
            <div key={m.id} className={m.role === "customer" ? "text-right" : "text-left"}>
              <span
                className={
                  m.role === "customer"
                    ? "inline-block max-w-[85%] rounded-lg bg-accent px-3 py-2 text-sm text-white"
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

              <p className="mt-0.5 text-xs text-slate-400">{new Date(m.created_at).toLocaleTimeString()}</p>
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
