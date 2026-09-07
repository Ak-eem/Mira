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
    .select("id, session_token, channel, needs_human, claimed_by, last_message_at")
    .eq("business_id", businessId)
    .order("needs_human", { ascending: false })
    .order("last_message_at", { ascending: false })
    .limit(50);

  return (
    <div>
      {(!conversations || conversations.length === 0) && (
        <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">
          No conversations yet.
        </p>
      )}
      <ul className="space-y-2">
        {conversations?.map((c) => (
          <li key={c.id}>
            <Link
              href={`/portal/${businessId}/conversations/${c.id}`}
              className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-accent"
            >
              <span className="flex items-center gap-2">
                {c.claimed_by ? (
                  <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-700">
                    {c.claimed_by}
                  </span>
                ) : (
                  c.needs_human && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                      Needs you
                    </span>
                  )
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
