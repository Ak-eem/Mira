import Link from "next/link";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { timed } from "@/lib/perf";
import type { Business } from "@/lib/types";
import type { BusinessSubscription, SubscriptionStatus } from "@/lib/plans";
import { AnalyticsStripAsync } from "./AnalyticsStripAsync";
import { SystemIssues, SystemIssuesSkeleton } from "./SystemIssues";
import { countSubscriptions } from "@/lib/admin/subscriptionCounts";
import { PageHeader } from "@/components/ui/PageHeader";
import { ErrorNotice } from "@/components/ErrorNotice";
import { Skeleton } from "@/components/Skeleton";

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

  return (
    <div className="space-y-8">
      {(businessesError || subscriptionsError) && (
        <div className="space-y-3">
          {businessesError && <ErrorNotice what="load businesses" error={businessesError} />}
          {subscriptionsError && <ErrorNotice what="load subscriptions" error={subscriptionsError} />}
        </div>
      )}
      <div>
        <PageHeader title="Dashboard" subtitle="How Mira is doing across every business." />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="glass-panel rounded-xl p-5">
            <p className="text-3xl font-semibold tracking-tight text-slate-900">{businessesError ? "-" : businesses?.length ?? 0}</p>
            <p className="mt-1 text-sm text-slate-500">Businesses</p>
          </div>
          <div className="glass-panel rounded-xl p-5">
            <p className="text-3xl font-semibold tracking-tight text-sky-700">{subscriptionsError ? "-" : counts.onTrial}</p>
            <p className="mt-1 text-sm text-slate-500">On trial</p>
          </div>
          <div className="glass-panel rounded-xl p-5">
            <p className="text-3xl font-semibold tracking-tight text-emerald-700">{subscriptionsError ? "-" : counts.active}</p>
            <p className="mt-1 text-sm text-slate-500">Active plan</p>
          </div>
          <div className={`rounded-xl p-5 transition ${counts.needsPayment > 0 ? "border border-amber-300/50 bg-amber-50/70 backdrop-blur-md" : "glass-panel"}`}>
            <p className={`text-3xl font-semibold tracking-tight ${counts.needsPayment > 0 ? "text-amber-700" : "text-slate-900"}`}>
              {subscriptionsError ? "-" : counts.needsPayment}
            </p>
            <p className={`mt-1 text-sm ${counts.needsPayment > 0 ? "text-amber-700" : "text-slate-500"}`}>Need payment (trial ended, past due or cancelled)</p>
          </div>
        </div>
      </div>

      <Suspense fallback={<SystemIssuesSkeleton />}>
        <SystemIssues />
      </Suspense>

      <Suspense fallback={<AnalyticsStripSkeleton />}>
        <AnalyticsStripAsync />
      </Suspense>

      <div className="glass-panel rounded-xl p-5">
        <p className="mb-3 font-medium text-slate-900">Quick actions</p>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/businesses/new" className="glass-hover rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white">
            + New business
          </Link>
          <Link href="/admin/businesses" className="glass-hover rounded-lg px-3 py-1.5 text-sm font-medium text-slate-700">
            View businesses
          </Link>
          <Link href="/admin/analytics" className="glass-hover rounded-lg px-3 py-1.5 text-sm font-medium text-slate-700">
            Open Mira Analytics
          </Link>
          <Link href="/admin/activity" className="glass-hover rounded-lg px-3 py-1.5 text-sm font-medium text-slate-700">
            Review activity
          </Link>
        </div>
      </div>
    </div>
  );
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
