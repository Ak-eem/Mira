import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { SegmentedLinks } from "@/components/ui/Segmented";
import { customerLabel } from "@/lib/customerLabel";
import { formatDateTime } from "@/lib/format";
import { ErrorNotice } from "@/components/ErrorNotice";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getRequestUser } from "@/lib/supabase/request";
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
  const user = await getRequestUser();
  const currentUserId = user?.id ?? "";
  const currentUserEmail = user?.email ?? "";
  const owner = await getCurrentBusinessOwner();
  // Was `owner?.userId === currentUserId` -- since getCurrentBusinessOwner()
  // already returns the current session's own user, that comparison was
  // trivially true for anyone linked to the business at all, staff
  // included. Now checks the actual business_owners.role for this
  // specific business.
  const membership = owner?.businesses.find((b) => b.id === businessId);
  const isOwner = membership?.role === "owner";

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

  const { data: conversations, error: conversationsError } = await conversationsQuery
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

  const filterOptions = filters.map((item) => ({ key: item.value, label: item.label, href: item.value === "all" ? basePath : `${basePath}?filter=${item.value}` }));

  return (
    <div>
      <PageHeader title="Conversations" subtitle="Everything customers have asked, across your website and WhatsApp." />

      <div className="mb-5 overflow-x-auto pb-1">
        <SegmentedLinks label="Conversation filters" current={filter} options={filterOptions} />
      </div>

      {conversationsError && <ErrorNotice what="load your conversations" error={conversationsError} />}
      {!conversationsError && (!conversations || conversations.length === 0) && (
        <EmptyState
          icon="chat"
          title={filter === "all" ? "No conversations yet" : "Nothing here"}
          description={filter === "all" ? "When a customer chats with Mira on your website or WhatsApp, the conversation shows up here." : "No conversations match this filter. Try All to see everything."}
        />
      )}

      {conversations && conversations.length > 0 && (
        <ul className="ui-group ui-enter">
          {conversations.map((conversation) => (
            <li key={conversation.id} className="ui-row flex-wrap justify-between gap-y-2">
              <Link href={`${basePath}/${conversation.id}`} className="flex min-w-0 flex-1 items-center justify-between gap-4 py-0.5">
                <span className="flex min-w-0 items-center gap-2.5">
                  {conversation.is_unread && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-accent" title="Unread" aria-label="Unread" />}
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-[15px] font-medium text-slate-900">{customerLabel(conversation.session_token)}</span>
                      {conversation.needs_human && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">Needs you</span>}
                    </span>
                    <span className={`ui-hint block ${conversation.channel === "whatsapp" ? "!text-emerald-700" : ""}`}>{conversation.channel === "whatsapp" ? "WhatsApp" : "Website"}</span>
                  </span>
                </span>
                <span className="shrink-0 text-sm text-slate-500">{formatDateTime(conversation.last_message_at)}</span>
              </Link>

              <AssignmentControls
                conversationId={conversation.id}
                claimedBy={conversation.claimed_by ?? null}
                currentUserId={currentUserEmail}
                isOwner={isOwner}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
