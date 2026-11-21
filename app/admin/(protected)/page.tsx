import Link from "next/link";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { timed } from "@/lib/perf";
import type { Business } from "@/lib/types";
import type { BusinessSubscription, SubscriptionStatus } from "@/lib/plans";
import { AnalyticsStripAsync } from "./AnalyticsStripAsync";
import { SystemIssues, SystemIssuesSkeleton } from "./SystemIssues";
import { AiCostCard, AiCostCardSkeleton } from "./AiCostCard";
import { countSubscriptions } from "@/lib/admin/subscriptionCounts";
import { PageHeader } from "@/components/ui/PageHeader";
import { ErrorNotice } from "@/components/ErrorNotice";
import { Skeleton } from "@/components/Skeleton";
import { ActivityPanel, type ChartMetric, type ChartPoint } from "@/app/portal/(protected)/[businessId]/ActivityChart";
import { CHART_DAYS, DAY_MS, dailySeries, fetchPaged } from "@/lib/dashboard/chartSeries";

// Uses the RLS-respecting client (not service-role) — every query here only
// returns rows because the current session passes is_platform_admin().
export const metadata = { title: "Dashboard" };

export default async function AdminDashboardPage() {
  const supabase = await createClient();
  const [{ data: businesses, error: businessesError }, { data: subscriptions, error: subscriptionsError }] = await timed("admin:dashboard-queries", Promise.all([
    supabase
      .from("businesses")
      .select("id, name")
      .returns<Pick<Business, "id" | "name">[]>(),
    supabase
      .from("business_subscriptions")
      .select("business_id, plan, status, trial_started_at, trial_ends_at")
      .order("updated_at", { ascending: false })
      .returns<(BusinessSubscription & { business_id: string })[]>(),
  ]));

  const latestSubscriptionByBusiness = new Map<string, BusinessSubscription & { business_id: string }>();
  for (const subscription of subscriptions ?? []) {
    if (!latestSubscriptionByBusiness.has(subscription.business_id)) {
      latestSubscriptionByBusiness.set(subscription.business_id, subscription);
    }
  }
  const counts = countSubscriptions([...latestSubscriptionByBusiness.values()]);

  // Read per request (this page is dynamic), so the 30-day window never freezes.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const chartStart = new Date(now - CHART_DAYS * DAY_MS).toISOString();
  // Newest first, so a very busy platform loses its oldest days (not the latest) past the cap.
  const conversationRows = await timed("admin:dashboard-chart", fetchPaged<{ started_at: string; channel: string | null }>(
    (from, to) =>
      supabase.from("conversations").select("started_at, channel").gte("started_at", chartStart).order("started_at", { ascending: false }).range(from, to),
    10000,
  ));
  const conversationSeries = dailySeries(
    now,
    conversationRows.map((r) => ({ at: r.started_at, value: 1, channel: r.channel === "whatsapp" || r.channel === "email" ? r.channel : "web" })),
  );
  const chartMetrics: ChartMetric[] = [
    {
      id: "conversations",
      title: "Conversations",
      kind: "count",
      points: conversationSeries,
      channels: [
        { id: "web", label: "Website" },
        { id: "whatsapp", label: "WhatsApp" },
        { id: "email", label: "Email" },
      ],
      emptyMessage: "Activity shows up here once customers start chatting with Mira.",
    },
  ];
  const sum = (points: ChartPoint[]) => points.reduce((total, point) => total + point.value, 0);
  const chatsNow = sum(conversationSeries.slice(-30));
  const chatsBefore = sum(conversationSeries.slice(-60, -30));
  const delta = chatsNow - chatsBefore;
  const dash = (failed: unknown, value: number) => (failed ? "-" : value);

  return (
    <div className="space-y-6">
      {(businessesError || subscriptionsError) && (
        <div className="space-y-3">
          {businessesError && <ErrorNotice what="load businesses" error={businessesError} />}
          {subscriptionsError && <ErrorNotice what="load subscriptions" error={subscriptionsError} />}
        </div>
      )}
      <PageHeader title="Dashboard" subtitle="How Mira is doing across every business." />

      <div className="grid min-w-0 gap-5 min-[1200px]:grid-cols-12">
        <ActivityPanel metrics={chartMetrics} className="min-w-0 min-[1200px]:col-span-8" />

        <div className="flex min-w-0 flex-col gap-3 min-[1200px]:col-span-4">
          <div className="glass-panel rounded-[18px] px-5 py-4">
            <p className="text-xs font-medium text-muted">Chats, last 30 days</p>
            <div className="mt-1 flex items-center justify-between gap-3">
              <p className="text-3xl font-semibold tracking-tight text-ink">{chatsNow.toLocaleString()}</p>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${delta > 0 ? "bg-lime text-ink" : "bg-mist text-muted"}`}>
                {delta > 0 ? `+${delta} new` : delta < 0 ? `${delta} vs prior` : "No change"}
              </span>
            </div>
          </div>
          <Slab label="Businesses" value={dash(businessesError, businesses?.length ?? 0)} href="/admin/businesses" />
          <Slab label="On trial" value={dash(subscriptionsError, counts.onTrial)} />
          <Slab label="Active plan" value={dash(subscriptionsError, counts.active)} tone="good" />
          <Slab label="Need payment" hint="Trial ended, past due or cancelled" value={dash(subscriptionsError, counts.needsPayment)} tone={counts.needsPayment > 0 ? "warn" : undefined} />
        </div>
      </div>

      <Suspense fallback={<SystemIssuesSkeleton />}>
        <SystemIssues />
      </Suspense>

      <Suspense fallback={<AnalyticsStripSkeleton />}>
        <AnalyticsStripAsync />
      </Suspense>

      <Suspense fallback={<AiCostCardSkeleton />}>
        <AiCostCard />
      </Suspense>

      <div className="flex flex-wrap gap-2">
        <Link href="/admin/businesses/new" className="ui-btn ui-btn-primary">+ New business</Link>
        <Link href="/admin/businesses" className="ui-btn ui-btn-secondary">View businesses</Link>
        <Link href="/admin/analytics" className="ui-btn ui-btn-secondary">Mira Analytics</Link>
        <Link href="/admin/activity" className="ui-btn ui-btn-secondary">Review activity</Link>
      </div>
    </div>
  );
}

function Slab({ label, value, hint, href, tone }: { label: string; value: string | number; hint?: string; href?: string; tone?: "good" | "warn" }) {
  const body = (
    <>
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">{label}</p>
        {hint ? <p className="truncate text-xs text-muted">{hint}</p> : null}
      </div>
      <p className={`text-2xl font-semibold tracking-tight ${tone === "warn" ? "text-danger" : tone === "good" ? "text-accent" : "text-ink"}`}>{value}</p>
    </>
  );
  const cls = `glass-panel flex min-w-0 items-center justify-between gap-4 rounded-[18px] px-5 py-3 ${tone === "warn" ? "border border-marigold" : ""}`;
  return href ? <Link href={href} className={`${cls} glass-hover`}>{body}</Link> : <div className={cls}>{body}</div>;
}

function AnalyticsStripSkeleton() {
  return (
    <div className="glass-panel rounded-xl p-5" aria-hidden="true">
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto] lg:items-center">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className={index === 4 ? "lg:justify-self-end" : undefined}>
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-2 h-7 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
