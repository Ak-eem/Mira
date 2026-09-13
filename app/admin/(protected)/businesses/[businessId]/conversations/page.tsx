import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function ConversationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ q?: string; filter?: string; sort?: string }>;
}) {
  const { businessId } = await params;
  const filters = await searchParams;
  const search = filters.q?.trim() ?? "";
  const filter = filters.filter === "human" || filters.filter === "active" || filters.filter === "resolved" ? filters.filter : "all";
  const sort = filters.sort === "oldest" ? "oldest" : "newest";
  const supabase = await createClient();

  let conversationsQuery = supabase
    .from("conversations")
    .select("id, session_token, channel, needs_human, claimed_by, started_at, last_message_at")
    .eq("business_id", businessId);
  if (search) conversationsQuery = conversationsQuery.ilike("session_token", `%${search}%`);
  if (filter === "human") conversationsQuery = conversationsQuery.eq("needs_human", true);
  if (filter === "active") conversationsQuery = conversationsQuery.eq("status", "open");
  if (filter === "resolved") conversationsQuery = conversationsQuery.eq("status", "closed");
  const { data: conversations, error } = await conversationsQuery.order("needs_human", { ascending: false }).order("last_message_at", { ascending: sort === "oldest" }).limit(50);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><h1 className="mt-2 text-xl font-semibold">Chat</h1><span className="text-xs text-slate-500">Business-scoped inbox</span></div>

      <form className="mb-5 flex flex-wrap gap-2" method="get">
        <input name="q" defaultValue={search} placeholder="Search customer identifier" aria-label="Search conversations" className="min-w-52 flex-1 rounded-lg border border-teal-900/10 bg-white/70 px-3 py-2 text-sm" />
        <select name="filter" defaultValue={filter} aria-label="Filter conversations" className="rounded-lg border border-teal-900/10 bg-white/70 px-3 py-2 text-sm"><option value="all">All</option><option value="human">Needs human</option><option value="active">Active</option><option value="resolved">Resolved</option></select>
        <select name="sort" defaultValue={sort} aria-label="Sort conversations" className="rounded-lg border border-teal-900/10 bg-white/70 px-3 py-2 text-sm"><option value="newest">Newest</option><option value="oldest">Oldest</option></select>
        <button type="submit" className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white">Filter</button>
      </form>

      {error && <p className="text-sm text-red-600">Couldn&apos;t load chat: {error.message}</p>}
      {!error && (!conversations || conversations.length === 0) && (
        <p className="text-sm text-slate-500">No conversations yet — they&apos;ll show up here once someone chats.</p>
      )}

      {!error && <ul className="space-y-2">
        {conversations?.map((c) => (
          <li key={c.id}>
            <Link
              href={`/admin/businesses/${businessId}/conversations/${c.id}`}
              className="flex items-center justify-between rounded border border-slate-200 bg-white p-3 hover:border-accent"
            >
              <span className="flex items-center gap-2">
                {c.claimed_by ? (
                  <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-700">
                    {c.claimed_by}
                  </span>
                ) : (
                  c.needs_human && (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
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
      </ul>}
    </div>
  );
}
