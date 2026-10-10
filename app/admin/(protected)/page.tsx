import Link from "next/link";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Business } from "@/lib/types";
import type { BusinessSubscription, SubscriptionStatus } from "@/lib/plans";
import { AnalyticsStripAsync } from "./AnalyticsStripAsync";

// Uses the RLS-respecting client (not service-role) — every query here only
// returns rows because the current session passes is_platform_admin().
export default async function AdminDashboardPage() {
  const supabase = await createClient();
  const [{ data: businesses, error: businessesError }, { data: subscriptions, error: subscriptionsError }] = await Promise.all([
    supabase
      .from("businesses")
      .select("id, name")
      .returns<Pick<Business, "id" | "name">[]>(),
    supabase
      .from("business_subscriptions")
      .select("business_id, plan, status, trial_started_at, trial_ends_at")
      .order("updated_at", { ascending: false })
      .returns<(BusinessSubscription & { business_id: string })[]>(),
  ]);

  const counts = { trialing: 0, active: 0, past_due: 0, cancelled: 0 };
  const latestSubscriptionByBusiness = new Map<string, BusinessSubscription & { business_id: string }>();
  for (const subscription of subscriptions ?? []) {
    if (!latestSubscriptionByBusiness.has(subscription.business_id)) {
      latestSubscriptionByBusiness.set(subscription.business_id, subscription);
    }
  }
  for (const subscription of latestSubscriptionByBusiness.values()) {
    const status = subscription.status as SubscriptionStatus;
    counts[status] += 1;
  }

  return (
    <div className="space-y-8">
      {(businessesError || subscriptionsError) && (
        <div className="space-y-1 text-sm text-red-600">
          {businessesError && <p>Couldn&apos;t load businesses: {businessesError.message}</p>}
          {subscriptionsError && <p>Couldn&apos;t load subscriptions: {subscriptionsError.message}</p>}
        </div>
      )}
      <div>
        <h1 className="mb-4 text-xl font-semibold text-slate-900">Dashboard</h1>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="glass-panel rounded-xl p-5">
            <p className="text-3xl font-semibold tracking-tight text-slate-900">{businessesError ? "-" : businesses?.length ?? 0}</p>
            <p className="mt-1 text-sm text-slate-500">Businesses</p>
          </div>
          <div className="glass-panel rounded-xl p-5">
            <p className="text-3xl font-semibold tracking-tight text-sky-700">{subscriptionsError ? "-" : counts.trialing}</p>
            <p className="mt-1 text-sm text-slate-500">On trial</p>
          </div>
          <div className="glass-panel rounded-xl p-5">
            <p className="text-3xl font-semibold tracking-tight text-emerald-700">{subscriptionsError ? "-" : counts.active}</p>
            <p className="mt-1 text-sm text-slate-500">Active plan</p>
          </div>
          <div className={`rounded-xl p-5 transition ${counts.past_due + counts.cancelled > 0 ? "border border-amber-300/50 bg-amber-50/70 backdrop-blur-md" : "glass-panel"}`}>
            <p className={`text-3xl font-semibold tracking-tight ${counts.past_due + counts.cancelled > 0 ? "text-amber-700" : "text-slate-900"}`}>
              {subscriptionsError ? "-" : counts.past_due + counts.cancelled}
            </p>
            <p className={`mt-1 text-sm ${counts.past_due + counts.cancelled > 0 ? "text-amber-700" : "text-slate-500"}`}>Past due or cancelled</p>
          </div>
        </div>
      </div>

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
      <div className="grid animate-pulse gap-5 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto] lg:items-center">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className={index === 4 ? "lg:justify-self-end" : undefined}>
            <div className="h-3 w-24 rounded-sm bg-slate-200" />
            <div className="mt-2 h-7 w-20 rounded-sm bg-slate-200" />
          </div>
        ))}
      </div>
    </div>
  );
}
