import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Business } from "@/lib/types";
import type { BusinessSubscription, SubscriptionStatus } from "@/lib/plans";
import { getAnalyticsSnapshot } from "@/lib/analytics/queries";
import { AnalyticsStrip } from "./AnalyticsStrip";

type FlaggedConversation = {
  id: string;
  business_id: string;
  started_at: string;
  claimed_by: string | null;
};

// Uses the RLS-respecting client (not service-role) — every query here only
// returns rows because the current session passes is_platform_admin().
export default async function AdminDashboardPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const requestedPage = Number.parseInt((await searchParams).page ?? "1", 10);
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const pageSize = 20;
  const supabase = await createClient();
  const [{ data: businesses, error: businessesError }, { data: subscriptions, error: subscriptionsError }, { data: flagged, error: flaggedError, count: flaggedCount }] = await Promise.all([
    supabase
      .from("businesses")
      .select("id, name")
      .returns<Pick<Business, "id" | "name">[]>(),
    supabase
      .from("business_subscriptions")
      .select("business_id, plan, status, trial_started_at, trial_ends_at")
      .order("updated_at", { ascending: false })
      .returns<(BusinessSubscription & { business_id: string })[]>(),
    supabase
      .from("conversations")
      .select("id, business_id, started_at, claimed_by", { count: "exact" })
      .eq("needs_human", true)
      .is("claimed_by", null)
      .order("started_at", { ascending: true })
      .range((page - 1) * pageSize, page * pageSize - 1)
      .returns<FlaggedConversation[]>(),
  ]);
  const analyticsResult = await getAnalyticsSnapshot(null, "7d");

  const businessNameById = new Map((businesses ?? []).map((b) => [b.id, b.name]));
  const unclaimedFlagged = flagged ?? [];

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
      {(businessesError || subscriptionsError || flaggedError) && (
        <div className="space-y-1 text-sm text-red-600">
          {businessesError && <p>Couldn&apos;t load businesses: {businessesError.message}</p>}
          {subscriptionsError && <p>Couldn&apos;t load subscriptions: {subscriptionsError.message}</p>}
          {flaggedError && <p>Couldn&apos;t load flagged conversations: {flaggedError.message}</p>}
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
          <div
            className={`rounded-xl p-5 transition ${
              unclaimedFlagged.length > 0
                ? "glass-alert-pulse border border-amber-300/50 bg-amber-50/70 backdrop-blur-md"
                : "glass-panel"
            }`}
          >
            <p className={`text-3xl font-semibold tracking-tight ${unclaimedFlagged.length > 0 ? "text-amber-700" : "text-slate-900"}`}>
              {flaggedError ? "-" : unclaimedFlagged.length}
            </p>
            <p className={`mt-1 text-sm ${unclaimedFlagged.length > 0 ? "text-amber-700" : "text-slate-500"}`}>
              Need a human, unclaimed
            </p>
          </div>
        </div>
      </div>

      {analyticsResult.data && <AnalyticsStrip snapshot={analyticsResult.data} />}
      {analyticsResult.error && <p className="text-sm text-amber-700">Platform analytics are unavailable: {analyticsResult.error.message}</p>}

      {!flaggedError && unclaimedFlagged.length > 0 && (
        <div className="glass-panel rounded-xl p-5">
          <p className="mb-3 font-medium text-slate-900">Needs attention, across every business</p>
          <ul className="divide-y divide-teal-900/10">
            {unclaimedFlagged.slice(0, 8).map((c) => (
              <li key={c.id}>
                <Link
                  href={`/admin/businesses/${c.business_id}/conversations/${c.id}`}
                  className="glass-hover -mx-2 flex items-center justify-between rounded-lg px-2 py-2 text-sm"
                >
                  <span className="font-medium text-slate-700">
                    {businessNameById.get(c.business_id) ?? "Unknown business"}
                  </span>
                  <span className="text-slate-400">
                    {new Date(c.started_at).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {(flaggedCount ?? 0) > pageSize && (
            <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
              {page > 1 ? <Link href={`/admin?page=${page - 1}`} className="hover:text-slate-700">Previous</Link> : <span />}
              <span>Page {page}</span>
              {page * pageSize < (flaggedCount ?? 0) ? <Link href={`/admin?page=${page + 1}`} className="hover:text-slate-700">Next</Link> : <span />}
            </div>
          )}
        </div>
      )}

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
