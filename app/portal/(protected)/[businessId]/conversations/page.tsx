import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentBusinessOwner } from "@/lib/supabase/portal-auth";
import AssignmentControls from "./AssignmentControls";

type ConversationFilter = "all" | "mine" | "unassigned" | "other";

type SearchParams = Promise<{
  filter?: string | string[];
}>;

export default async function PortalConversationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams?: SearchParams;
}) {
  const { businessId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const rawFilter = Array.isArray(resolvedSearchParams.filter)
    ? resolvedSearchParams.filter[0]
    : resolvedSearchParams.filter;
  const filter: ConversationFilter =
    rawFilter === "mine" || rawFilter === "assigned-to-me"
      ? "mine"
      : rawFilter === "unassigned"
        ? "unassigned"
        : rawFilter === "other" || rawFilter === "assigned-to-another"
          ? "other"
          : "all";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const currentUserId = user?.id ?? "";
  const currentUserEmail = user?.email ?? "";
  const owner = await getCurrentBusinessOwner();
  const isOwner = owner?.userId === currentUserId;

  let conversationsQuery = supabase
    .from("conversations")
    .select(
      "id, session_token, channel, needs_human, claimed_by, is_unread, last_message_at",
    )
    .eq("business_id", businessId);

  if (filter === "mine") {
    conversationsQuery = conversationsQuery.eq("claimed_by", currentUserEmail);
  } else if (filter === "unassigned") {
    conversationsQuery = conversationsQuery.is("claimed_by", null);
  } else if (filter === "other") {
    conversationsQuery = conversationsQuery
      .not("claimed_by", "is", null)
      .neq("claimed_by", currentUserEmail);
  }

  const { data: conversations } = await conversationsQuery
    .order("needs_human", { ascending: false })
    .order("last_message_at", { ascending: false })
    .limit(50);

  const basePath = `/portal/${businessId}/conversations`;
  const filters: { value: ConversationFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "mine", label: "Assigned to me" },
    { value: "unassigned", label: "Unassigned" },
    { value: "other", label: "Assigned to another" },
  ];

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-slate-900">
            Conversations
          </h2>
          <p className="text-sm text-slate-500">Shared inbox</p>
        </div>
        <nav
          aria-label="Conversation assignment filters"
          className="flex flex-wrap gap-2"
        >
          {filters.map((item) => {
            const href =
              item.value === "all"
                ? basePath
                : `${basePath}?filter=${item.value}`;

            return (
              <Link
                key={item.value}
                href={href}
                aria-current={filter === item.value ? "page" : undefined}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  filter === item.value
                    ? "border-accent bg-accent text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:border-accent hover:text-accent"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {(!conversations || conversations.length === 0) && (
        <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">
          No conversations match this filter.
        </p>
      )}

      <ul className="space-y-2">
        {conversations?.map((conversation) => (
          <li
            key={conversation.id}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-accent"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Link
                href={`${basePath}/${conversation.id}`}
                className="flex min-w-0 flex-1 items-center justify-between gap-4"
              >
                <span className="flex min-w-0 items-center gap-2">
                  {conversation.is_unread && (
                    <span
                      className="h-2 w-2 shrink-0 rounded-full bg-accent"
                      title="Unread"
                      aria-label="Unread"
                    />
                  )}
                  {conversation.needs_human && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                      Needs you
                    </span>
                  )}
                  <span className="font-mono text-xs text-slate-500">
                    {conversation.session_token.slice(0, 8)}…
                  </span>
                  <span
                    className={`text-xs font-medium ${
                      conversation.channel === "whatsapp"
                        ? "text-emerald-600"
                        : "text-slate-400"
                    }`}
                  >
                    {conversation.channel === "whatsapp" ? "WhatsApp" : "Web"}
                  </span>
                </span>
                <span className="shrink-0 text-sm text-slate-500">
                  {new Date(conversation.last_message_at).toLocaleString()}
                </span>
              </Link>

              <AssignmentControls
                conversationId={conversation.id}
                claimedBy={conversation.claimed_by ?? null}
                currentUserEmail={currentUserEmail}
                isOwner={isOwner}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
