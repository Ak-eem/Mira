import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isOpenNow } from "@/lib/hours";
import { formatRelativeTime } from "@/lib/format";
import { CopyLinkButton } from "./CopyLinkButton";

type MiraStatus = "online" | "needs_attention" | "offline";

export default async function BusinessDetailPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("*")
    .eq("id", businessId)
    .maybeSingle();

  if (!business) notFound();

  const [
    { data: hours },
    { data: services },
    { data: products },
    { data: allPromotions },
    { data: faqs },
    { data: policies },
    { data: recentConversations },
    { data: recentActivity },
    { data: flaggedConversations },
  ] = await Promise.all([
    supabase
      .from("business_hours")
      .select("day_of_week, opens_at, closes_at")
      .eq("business_id", businessId),
    supabase.from("services").select("id").eq("business_id", businessId),
    supabase.from("products").select("id").eq("business_id", businessId),
    supabase
      .from("promotions")
      .select("id, starts_at, ends_at")
      .eq("business_id", businessId)
      .eq("is_active", true),
    supabase
      .from("faqs")
      .select("id")
      .eq("business_id", businessId)
      .eq("is_active", true),
    supabase
      .from("policies")
      .select("id")
      .eq("business_id", businessId)
      .eq("is_active", true),
    supabase
      .from("conversations")
      .select("id, session_token, channel, needs_human, last_message_at")
      .eq("business_id", businessId)
      .order("last_message_at", { ascending: false })
      .limit(3),
    supabase
      .from("activity_log")
      .select("id, entity_type, action, summary, source, created_at")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase.from("conversations").select("id").eq("business_id", businessId).eq("needs_human", true),
  ]);

  const flaggedCount = flaggedConversations?.length ?? 0;

  const now = new Date();
  const activePromotionsCount = (allPromotions ?? []).filter((p) => {
    const started = !p.starts_at || new Date(p.starts_at) <= now;
    const notEnded = !p.ends_at || new Date(p.ends_at) >= now;
    return started && notEnded;
  }).length;

  const hasOfferings = (services ?? []).length > 0 || (products ?? []).length > 0;
  const hasHours = (hours ?? []).some((h) => h.opens_at && h.closes_at);

  let miraStatus: MiraStatus;
  let statusReason: string | null = null;

  if (!business.is_active) {
    miraStatus = "offline";
  } else if (!hasOfferings) {
    miraStatus = "needs_attention";
    statusReason = "No services or products listed yet";
  } else if (!hasHours) {
    miraStatus = "needs_attention";
    statusReason = "No hours configured yet";
  } else {
    miraStatus = "online";
  }

  const statusStyles: Record<MiraStatus, string> = {
    online: "bg-lime text-ink",
    needs_attention: "bg-marigold/25 text-ink",
    offline: "bg-mist text-muted",
  };
  const statusLabels: Record<MiraStatus, string> = {
    online: "Online",
    needs_attention: "Needs attention",
    offline: "Offline",
  };

  const openNow =
    miraStatus !== "offline" ? isOpenNow(hours ?? [], business.timezone) : null;

  return (
    <div className="space-y-6">
      <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <h1 className="break-words text-2xl font-semibold tracking-tight text-ink">{business.name}</h1>
          <p className="break-all font-mono text-sm text-muted">
            /chat/{business.slug} · {business.currency} · {business.timezone}
          </p>
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:items-end">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:flex-col sm:items-end sm:gap-1">
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${statusStyles[miraStatus]}`}>
              {statusLabels[miraStatus]}
            </span>
            {openNow !== null && (
              <span
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${openNow ? "bg-lime text-ink" : "bg-mist text-muted"}`}
              >
                {openNow ? "Open now" : "Closed now"}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <CopyLinkButton slug={business.slug} />
            <a
              href={`/chat/${business.slug}`}
              target="_blank"
              rel="noreferrer"
              className="ui-btn ui-btn-primary ui-btn-sm"
            >
              Preview Mira →
            </a>
          </div>
        </div>
      </div>

      {flaggedCount > 0 && (
        <Link
          href={`/admin/businesses/${businessId}/conversations`}
          className="glass-panel glass-hover flex items-center justify-between rounded-[18px] border border-marigold px-5 py-4"
        >
          <span className="text-sm font-medium text-ink">
            {flaggedCount} conversation{flaggedCount === 1 ? "" : "s"} need{flaggedCount === 1 ? "s" : ""} you
          </span>
          <span className="text-xs font-medium text-accent">View →</span>
        </Link>
      )}

      {statusReason && <p className="text-sm text-ink-2">{statusReason}</p>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 min-[1200px]:grid-cols-5">
        {[
          ["Services", services?.length ?? 0],
          ["Products", products?.length ?? 0],
          ["Active promotions", activePromotionsCount],
          ["FAQs", faqs?.length ?? 0],
          ["Policies", policies?.length ?? 0],
        ].map(([label, value]) => (
          <div key={label} className="glass-panel rounded-[18px] px-5 py-4">
            <p className="text-3xl font-semibold tracking-tight text-ink">{value}</p>
            <p className="mt-1 text-xs text-muted">{label}</p>
          </div>
        ))}
      </div>
      <p className="-mt-3 text-xs text-muted">{business.ai_tone ? "Custom tone" : "Default tone"}</p>

      <section className="glass-panel rounded-[18px] p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Recent activity</h2>
          <Link href={`/admin/businesses/${businessId}/activity`} className="text-xs font-medium text-accent hover:underline">
            View all
          </Link>
        </div>

        {(!recentActivity || recentActivity.length === 0) && (
          <p className="text-sm text-muted">Nothing changed yet.</p>
        )}

        {recentActivity && recentActivity.length > 0 && (
          <ul className="space-y-1">
            {recentActivity.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between gap-3 rounded-xl bg-mist/60 px-3 py-2 text-sm text-ink"
              >
                <span>
                  {a.summary}
                  {a.source === "command_center" && (
                    <span className="ml-2 rounded-full bg-mist px-2 py-0.5 text-[10px] font-medium text-muted">
                      via Command Center
                    </span>
                  )}
                </span>
                <span className="whitespace-nowrap pl-3 text-xs text-muted">
                  {formatRelativeTime(a.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="glass-panel rounded-[18px] p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Recent conversations</h2>
          <Link href={`/admin/businesses/${businessId}/conversations`} className="text-xs font-medium text-accent hover:underline">
            View all
          </Link>
        </div>

        {(!recentConversations || recentConversations.length === 0) && (
          <p className="text-sm text-muted">No conversations yet — they&apos;ll show up here once someone chats.</p>
        )}

        {recentConversations && recentConversations.length > 0 && (
          <ul className="space-y-1">
            {recentConversations.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/admin/businesses/${businessId}/conversations/${c.id}`}
                  className="glass-hover flex items-center justify-between gap-3 rounded-xl bg-mist/60 px-3 py-2 text-sm text-ink"
                >
                  <span className="flex items-center gap-2">
                    {c.needs_human && (
                      <span className="rounded-full bg-marigold/25 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink">
                        Needs you
                      </span>
                    )}
                    <span className="font-mono text-xs text-muted">{c.session_token.slice(0, 8)}…</span>
                    <span className={`text-xs font-medium ${c.channel === "whatsapp" ? "text-accent" : "text-muted"}`}>
                      {c.channel === "whatsapp" ? "WhatsApp" : "Web"}
                    </span>
                  </span>
                  <span className="text-xs text-muted">{formatRelativeTime(c.last_message_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

    </div>
  );
}
