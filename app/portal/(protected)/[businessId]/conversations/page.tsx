import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function PortalConversationsPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const supabase = await createClient();

  const { data: conversations } = await supabase
    .from("conversations")
    .select("id, session_token, channel, needs_human, last_message_at")
    .eq("business_id", businessId)
    .order("needs_human", { ascending: false })
    .order("last_message_at", { ascending: false })
    .limit(50);

  return (
    <div>
      {(!conversations || conversations.length === 0) && (
        <p className="text-sm text-slate-500">No conversations yet.</p>
      )}
      <ul className="space-y-2">
        {conversations?.map((c) => (
          <li key={c.id}>
            <Link
              href={`/portal/${businessId}/conversations/${c.id}`}
              className="flex items-center justify-between rounded border border-slate-200 bg-white p-3 hover:border-accent"
            >
              <span className="flex items-center gap-2">
                {c.needs_human && (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                    Needs you
                  </span>
                )}
                <span className="font-mono text-xs text-slate-500">{c.session_token.slice(0, 8)}…</span>
                <span className={`text-xs font-medium ${c.channel === "whatsapp" ? "text-emerald-600" : "text-slate-400"}`}>
                  {c.channel === "whatsapp" ? "WhatsApp" : "Web"}
                </span>
              </span>
              <span className="text-sm text-slate-500">{new Date(c.last_message_at).toLocaleString()}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
