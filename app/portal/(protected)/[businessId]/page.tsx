import Link from "next/link";
import { ArrowRight, ArrowUpRight, Check, Circle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentBusinessOwner } from "@/lib/supabase/portal-auth";
import { Badge } from "@/components/site/ui";
import { naira } from "@/lib/site/format";
import { getOrderTakingEnabled } from "@/lib/orderSettings";
import { ActivityChart, type ChartPoint } from "./ActivityChart";

const DAY_MS = 24 * 60 * 60 * 1000;
const TZ = "Africa/Lagos";
const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
const dayLabel = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "numeric", month: "short" }).format(d);

// PostgREST returns at most 1000 rows per request, so page through (capped at 5000)
// rather than silently under-counting a busy month.
async function fetchPaged<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < 5000; from += 1000) {
    const { data } = await page(from, from + 999);
    if (!data) break;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows;
}

// One point per day for the last 30 days, zero-filled so quiet days still show.
function dailySeries(now: number, entries: { at: string; value: number }[]): ChartPoint[] {
  const totals = new Map<string, number>();
  for (const entry of entries) {
    const key = dayKey(new Date(entry.at));
    totals.set(key, (totals.get(key) ?? 0) + entry.value);
  }
  return Array.from({ length: 30 }, (_, i) => {
    const date = new Date(now - (29 - i) * DAY_MS);
    return { label: dayLabel(date), value: totals.get(dayKey(date)) ?? 0 };
  });
}

function timeAgo(iso: string | null, now: number): string {
  if (!iso) return "—";
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [["day", 86400], ["hour", 3600], ["minute", 60]];
  for (const [unit, size] of steps) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return "just now";
}

function customerLabel(sessionToken: string | null): string {
  if (!sessionToken) return "Website visitor";
  if (sessionToken.startsWith("email_")) return sessionToken.slice(6);
  if (sessionToken.startsWith("wa_")) return `+${sessionToken.slice(3)}`;
  return "Website visitor";
}

const CHANNEL_LABEL: Record<string, string> = { web: "Website", whatsapp: "WhatsApp", email: "Email" };

function DeltaPill({ current, previous }: { current: number; previous: number }) {
  if (previous === 0 && current === 0) return null;
  if (previous === 0) return <span className="rounded-full bg-lime px-2 py-0.5 text-xs font-medium text-ink">New</span>;
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return <span className="rounded-full bg-mist px-2 py-0.5 text-xs font-medium text-muted">No change</span>;
  const up = pct > 0;
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${up ? "bg-lime text-ink" : "bg-[#fbeae6] text-danger"}`}>
      {up ? "▲" : "▼"} {Math.abs(pct)}%
    </span>
  );
}

type Step = { done: boolean; title: string; description: string; href: string };

function OnboardingCard({ steps }: { steps: Step[] }) {
  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length) return null;
  return (
    <section className="glass-panel rounded-2xl p-5 sm:p-6" aria-labelledby="getting-started">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="getting-started" className="text-lg font-semibold tracking-tight text-ink">
          Get Mira ready for customers
        </h2>
        <span className="text-sm text-muted">
          {doneCount} of {steps.length} done
        </span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-mist" role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={doneCount}>
        <div className="h-full rounded-full bg-marigold transition-all" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
      </div>
      <ul className="mt-4 divide-y divide-line">
        {steps.map((step) => (
          <li key={step.title}>
            <Link href={step.href} className="group flex items-start gap-3 py-3">
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${step.done ? "bg-ink text-white" : "border border-line text-transparent"}`}
                aria-hidden="true"
              >
                {step.done ? <Check className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block text-sm font-medium ${step.done ? "text-muted line-through" : "text-ink"}`}>{step.title}</span>
                <span className="block text-sm text-muted">{step.description}</span>
              </span>
              {!step.done && <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-ink" aria-hidden="true" />}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default async function PortalDashboardPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const supabase = await createClient();
  const owner = await getCurrentBusinessOwner();
  const isOwner = owner?.businesses.find((b) => b.id === businessId)?.role === "owner";

  // This is a Server Component (no "use client", no hooks); it already renders fresh
  // per request. Hoisting this to module level, as the purity rule's fix suggests,
  // would bake the timestamp in at build/startup time, freezing the 30-day window.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const thirtyDaysAgo = new Date(now - 30 * DAY_MS).toISOString();
  const sixtyDaysAgo = new Date(now - 60 * DAY_MS).toISOString();

  const count = (table: string) => supabase.from(table).select("id", { count: "exact", head: true }).eq("business_id", businessId);

  const [
    { count: conversationCount },
    { count: previousConversationCount },
    { count: totalConversations },
    { count: needsHumanCount },
    { data: subscription },
    { count: nudgesSent },
    { count: nudgesDelivered },
    { count: nudgesReplied },
    { count: nudgesOptedOut },
    { data: business },
    { data: recent },
    { count: productCount },
    { count: serviceCount },
    { count: faqCount },
    { count: policyCount },
    { count: inviteCount },
    conversationRows,
    orderRows,
    orderTakingEnabled,
  ] = await Promise.all([
    count("conversations").gte("started_at", thirtyDaysAgo),
    count("conversations").gte("started_at", sixtyDaysAgo).lt("started_at", thirtyDaysAgo),
    count("conversations"),
    count("conversations").eq("needs_human", true),
    supabase.from("business_subscriptions").select("nudges_addon, plan, nudges_tier").eq("business_id", businessId).maybeSingle(),
    supabase.from("nudge_sends").select("id", { count: "exact", head: true }).eq("business_id", businessId).gte("sent_at", thirtyDaysAgo),
    supabase
      .from("nudge_sends")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .gte("sent_at", thirtyDaysAgo)
      .in("status", ["delivered", "read", "replied"]),
    supabase.from("nudge_sends").select("id", { count: "exact", head: true }).eq("business_id", businessId).gte("sent_at", thirtyDaysAgo).eq("status", "replied"),
    supabase.from("nudge_opt_outs").select("business_id", { count: "exact", head: true }).eq("business_id", businessId),
    supabase.from("businesses").select("slug, name").eq("id", businessId).maybeSingle(),
    supabase
      .from("conversations")
      .select("id, session_token, channel, needs_human, last_message_at")
      .eq("business_id", businessId)
      .order("last_message_at", { ascending: false })
      .limit(5),
    count("products"),
    count("services"),
    count("faqs"),
    count("policies"),
    count("team_invites").in("status", ["pending", "accepted"]),
    fetchPaged<{ started_at: string }>((from, to) =>
      supabase.from("conversations").select("started_at").eq("business_id", businessId).gte("started_at", thirtyDaysAgo).order("started_at").range(from, to),
    ),
    fetchPaged<{ created_at: string; total: number | null }>((from, to) =>
      supabase
        .from("orders")
        .select("created_at, total")
        .eq("business_id", businessId)
        .in("status", ["placed", "shipped", "delivered"])
        .gte("created_at", thirtyDaysAgo)
        .order("created_at")
        .range(from, to),
    ),
    getOrderTakingEnabled(businessId),
  ]);

  const conversationSeries = dailySeries(now, conversationRows.map((r) => ({ at: r.started_at, value: 1 })));
  const orderSeries = dailySeries(now, orderRows.map((r) => ({ at: r.created_at, value: Number(r.total ?? 0) })));
  const showOrders = orderTakingEnabled || orderRows.length > 0;

  const nudgesActive = subscription?.nudges_addon === true;
  const needsYou = needsHumanCount ?? 0;
  const base = `/portal/${businessId}`;

  const knowledge = (productCount ?? 0) + (serviceCount ?? 0) + (faqCount ?? 0) + (policyCount ?? 0);
  const steps: Step[] = [
    {
      done: knowledge > 0,
      title: "Teach Mira about your business",
      description: "Import from your website, or add products, FAQs and policies.",
      href: `${base}/settings#import-website`,
    },
    {
      done: (totalConversations ?? 0) > 0,
      title: "Get your first conversation",
      description: "Add the chat widget to your site and send a test message.",
      href: `${base}/settings#add-widget`,
    },
    ...(isOwner
      ? [{ done: (inviteCount ?? 0) > 0, title: "Invite a teammate", description: "Let staff answer the chats Mira hands over.", href: `${base}/team` }]
      : []),
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Welcome back</h1>
        <p className="mt-1 text-sm text-muted">Here&apos;s how {business?.name ?? "your business"} did in the last 30 days.</p>
      </div>

      <OnboardingCard steps={steps} />

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="glass-panel rounded-2xl p-5">
          <p className="text-sm text-muted">Conversations</p>
          <div className="mt-2 flex items-center gap-2">
            <p className="text-3xl font-semibold tracking-tight text-ink">{conversationCount ?? 0}</p>
            <DeltaPill current={conversationCount ?? 0} previous={previousConversationCount ?? 0} />
          </div>
          <p className="mt-2 text-xs text-muted">vs the 30 days before</p>
        </div>

        <Link
          href={`${base}/conversations`}
          className={`glass-hover rounded-2xl p-5 transition ${needsYou > 0 ? "glass-alert-pulse border border-marigold/50 bg-lime/70" : "glass-panel"}`}
        >
          <p className="text-sm text-muted">Need you now</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-ink">{needsYou}</p>
          <p className="mt-2 flex items-center gap-1 text-xs text-ink-2">
            {needsYou > 0 ? "Open the inbox" : "Nothing waiting"}
            {needsYou > 0 && <ArrowRight className="h-3 w-3" aria-hidden="true" />}
          </p>
        </Link>

        <Link href={nudgesActive ? `${base}/nudges` : `${base}/requests`} className="glass-panel glass-hover rounded-2xl p-5">
          <p className="text-sm text-muted">Nudges sent</p>
          {nudgesActive ? (
            <>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-ink">{nudgesSent ?? 0}</p>
              <p className="mt-2 text-xs text-muted">{nudgesDelivered ?? 0} delivered · {nudgesReplied ?? 0} replied</p>
            </>
          ) : (
            <>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-muted">Off</p>
              <p className="mt-2 flex items-center gap-1 text-xs text-ink-2">
                Request the Nudges add-on <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
              </p>
            </>
          )}
        </Link>
      </div>

      <div className={showOrders ? "grid gap-4 lg:grid-cols-2" : ""}>
        <ActivityChart
          title="Conversations"
          subtitle="Last 30 days"
          points={conversationSeries}
          emptyMessage="Your activity shows up here once customers start chatting with Mira."
        />
        {showOrders && (
          <ActivityChart
            title="Sales from orders"
            subtitle="Placed, shipped and delivered, last 30 days"
            points={orderSeries}
            format={naira}
            emptyMessage="Order value appears here after Mira takes your first order."
          />
        )}
      </div>

      <section className="glass-panel rounded-2xl" aria-labelledby="recent-conversations">
        <div className="flex items-center justify-between px-5 pt-5">
          <h2 id="recent-conversations" className="font-medium text-ink">
            Recent conversations
          </h2>
          <Link href={`${base}/conversations`} className="text-sm font-medium text-ink hover:underline">
            View all
          </Link>
        </div>
        {recent && recent.length > 0 ? (
          <ul className="mt-3 divide-y divide-line">
            {recent.map((conversation) => (
              <li key={conversation.id}>
                <Link href={`${base}/conversations/${conversation.id}`} className="flex items-center gap-3 px-5 py-3 transition hover:bg-mist/60">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{customerLabel(conversation.session_token)}</span>
                    <span className="block text-xs text-muted">
                      {CHANNEL_LABEL[conversation.channel as string] ?? "Chat"} · {timeAgo(conversation.last_message_at, now)}
                    </span>
                  </span>
                  {conversation.needs_human ? <Badge tone="lime">Needs you</Badge> : <Badge>Handled by Mira</Badge>}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 pb-6 pt-3 text-sm text-muted">
            No conversations yet. Once a customer messages your chat widget, WhatsApp or email address, it shows up here.
          </p>
        )}
        <div className="h-2" />
      </section>

      {nudgesActive && (
        <div className="glass-panel rounded-2xl p-5">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              ["Sent", nudgesSent],
              ["Delivered", nudgesDelivered],
              ["Replied", nudgesReplied],
              ["Opted out, all time", nudgesOptedOut],
            ].map(([label, value]) => (
              <div key={label as string}>
                <p className="text-xl font-semibold text-ink">{(value as number | null) ?? 0}</p>
                <p className="text-xs text-muted">{label as string}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
