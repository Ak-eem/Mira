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
      .select("id, session_token, channel, last_message_at")
      .eq("business_id", businessId)
      .order("last_message_at", { ascending: false })
      .limit(3),
    supabase
      .from("activity_log")
      .select("id, entity_type, action, summary, source, created_at")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

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
    online: "text-emerald-600",
    needs_attention: "text-amber-600",
    offline: "text-slate-400",
  };
  const statusLabels: Record<MiraStatus, string> = {
    online: "Online",
    needs_attention: "Needs attention",
    offline: "Offline",
  };

  const openNow =
    miraStatus !== "offline" ? isOpenNow(hours ?? [], business.timezone) : null;

  const sections = [
    { href: `/admin/businesses/${businessId}/services`, label: "Services" },
    { href: `/admin/businesses/${businessId}/products`, label: "Products" },
    { href: `/admin/businesses/${businessId}/hours`, label: "Hours" },
    { href: `/admin/businesses/${businessId}/promotions`, label: "Promotions" },
    { href: `/admin/businesses/${businessId}/closures`, label: "Closures" },
    { href: `/admin/businesses/${businessId}/faqs`, label: "FAQs" },
    { href: `/admin/businesses/${businessId}/policies`, label: "Policies" },
    { href: `/admin/businesses/${businessId}/conversations`, label: "Conversations" },
    { href: `/admin/businesses/${businessId}/activity`, label: "Activity" },
    { href: `/admin/businesses/${businessId}/command`, label: "Command Center" },
    { href: `/admin/businesses/${businessId}/settings`, label: "Settings" },
  ];

  return (
    <div>
      <Link href="/admin" className="text-sm text-slate-500 hover:underline">
        ← All businesses
      </Link>

      <div className="mb-2 mt-2 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{business.name}</h1>
          <p className="font-mono text-sm text-slate-500">
            /chat/{business.slug} · {business.currency} · {business.timezone}
          </p>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-col items-end gap-1">
            <span className={`text-xs font-medium ${statusStyles[miraStatus]}`}>
              {statusLabels[miraStatus]}
            </span>
            {openNow !== null && (
              <span
                className={
                  openNow
                    ? "text-xs font-medium text-emerald-600"
                    : "text-xs font-medium text-slate-400"
                }
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
              className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-dark"
            >
              Preview Mira →
            </a>
          </div>
        </div>
      </div>

      {statusReason && <p className="mb-6 text-sm text-amber-600">{statusReason}</p>}
      {!statusReason && <div className="mb-6" />}

      <div className="mb-6 flex flex-wrap gap-x-6 gap-y-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm">
        <span>
          <span className="font-mono font-medium">{services?.length ?? 0}</span> services
        </span>
        <span>
          <span className="font-mono font-medium">{products?.length ?? 0}</span> products
        </span>
        <span>
          <span className="font-mono font-medium">{activePromotionsCount}</span> active promotions
        </span>
        <span>
          <span className="font-mono font-medium">{faqs?.length ?? 0}</span> FAQs
        </span>
        <span>
          <span className="font-mono font-medium">{policies?.length ?? 0}</span> policies
        </span>
        <span className="text-slate-400">
          {business.ai_tone ? "custom tone" : "default tone"}
        </span>
      </div>

      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Recent activity</h2>
          <Link href={`/admin/businesses/${businessId}/activity`} className="text-xs text-accent hover:underline">
            View all
          </Link>
        </div>

        {(!recentActivity || recentActivity.length === 0) && (
          <p className="text-sm text-slate-500">Nothing changed yet.</p>
        )}

        {recentActivity && recentActivity.length > 0 && (
          <ul className="space-y-1">
            {recentActivity.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between rounded border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <span>
                  {a.summary}
                  {a.source === "command_center" && (
                    <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                      via Command Center
                    </span>
                  )}
                </span>
                <span className="whitespace-nowrap pl-3 text-xs text-slate-400">
                  {formatRelativeTime(a.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Recent conversations</h2>
          <Link href={`/admin/businesses/${businessId}/conversations`} className="text-xs text-accent hover:underline">
            View all
          </Link>
        </div>

        {(!recentConversations || recentConversations.length === 0) && (
          <p className="text-sm text-slate-500">No conversations yet — they'll show up here once someone chats.</p>
        )}

        {recentConversations && recentConversations.length > 0 && (
          <ul className="space-y-1">
            {recentConversations.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/admin/businesses/${businessId}/conversations/${c.id}`}
                  className="flex items-center justify-between rounded border border-slate-200 bg-white px-3 py-2 text-sm hover:border-accent"
                >
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-xs text-slate-500">{c.session_token.slice(0, 8)}…</span>
                    <span className={`text-xs font-medium ${c.channel === "whatsapp" ? "text-emerald-600" : "text-slate-400"}`}>
                      {c.channel === "whatsapp" ? "WhatsApp" : "Web"}
                    </span>
                  </span>
                  <span className="text-xs text-slate-400">{formatRelativeTime(c.last_message_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {sections.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="rounded-lg border border-slate-200 bg-white px-4 py-4 text-sm font-medium hover:border-accent"
          >
            {s.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
