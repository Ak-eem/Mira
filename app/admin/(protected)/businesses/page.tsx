import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Business } from "@/lib/types";
import { subscriptionLabel, type BusinessSubscription, type SubscriptionStatus } from "@/lib/plans";

const STATUS_STYLES: Record<SubscriptionStatus, string> = {
  trialing: "bg-sky-50 text-sky-700 border-sky-200",
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  past_due: "bg-amber-50 text-amber-700 border-amber-200",
  cancelled: "bg-slate-100 text-slate-500 border-slate-200",
};

// Uses the RLS-respecting client (not service-role) — every query here only
// returns rows because the current session passes is_platform_admin().
export default async function AdminBusinessesPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const requestedPage = Number.parseInt((await searchParams).page ?? "1", 10);
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const pageSize = 20;
  const supabase = await createClient();
  const [{ data: businesses, error, count }, { data: subscriptions, error: subscriptionsError }] = await Promise.all([
    supabase
      .from("businesses")
      .select("id, name, slug, is_active, created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1)
      .returns<(Pick<Business, "id" | "name" | "slug" | "is_active"> & { created_at: string })[]>(),
    supabase
      .from("business_subscriptions")
      .select("business_id, plan, status, trial_started_at, trial_ends_at")
      .returns<(BusinessSubscription & { business_id: string })[]>(),
  ]);

  const subscriptionByBusiness = new Map<string, BusinessSubscription>();
  for (const s of subscriptions ?? []) subscriptionByBusiness.set(s.business_id, s);

  const flaggedCounts = await Promise.all((businesses ?? []).map(async (business) => {
    const { count: flaggedCount, error: flaggedError } = await supabase
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("needs_human", true)
      .eq("business_id", business.id);
    return { businessId: business.id, flaggedCount, flaggedError };
  }));
  const flaggedError = flaggedCounts.find((result) => result.flaggedError)?.flaggedError;
  const flaggedCountByBusiness = new Map(flaggedCounts.map((result) => [result.businessId, result.flaggedCount ?? 0]));

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Businesses</h1>
        <Link
          href="/admin/businesses/new"
          className="glass-hover rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white"
        >
          + New business
        </Link>
      </div>

      {(error || subscriptionsError || flaggedError) && (
        <div className="space-y-1 text-sm text-red-600">
          {error && <p>Couldn&apos;t load businesses: {error.message}</p>}
          {subscriptionsError && <p>Couldn&apos;t load subscriptions: {subscriptionsError.message}</p>}
          {flaggedError && <p>Couldn&apos;t load flagged conversation counts: {flaggedError.message}</p>}
        </div>
      )}

      {!error && !subscriptionsError && !flaggedError && businesses?.length === 0 && (
        <p className="text-sm text-slate-500">No businesses yet — create the first one.</p>
      )}

      {!error && !subscriptionsError && !flaggedError && businesses && businesses.length > 0 && (
        <div className="glass-panel divide-y divide-teal-900/10 overflow-hidden rounded-xl">
          {businesses.map((b) => {
            const sub = subscriptionByBusiness.get(b.id);
            const flaggedCount = flaggedCountByBusiness.get(b.id) ?? 0;
            return (
              <Link
                key={b.id}
                href={`/admin/businesses/${b.id}`}
                className="glass-hover flex items-center justify-between px-4 py-3"
              >
                <div>
                  <p className="font-medium text-slate-900">{b.name}</p>
                  <p className="text-sm text-slate-500">/chat/{b.slug}</p>
                </div>
                <span className="flex items-center gap-2">
                  {flaggedCount > 0 && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                      🚩 {flaggedCount}
                    </span>
                  )}
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                      sub ? STATUS_STYLES[sub.status] : "border-slate-200 bg-slate-100 text-slate-500"
                    }`}
                  >
                    {subscriptionLabel(sub)}
                  </span>
                  {!b.is_active && <span className="text-xs font-medium text-slate-400">Inactive</span>}
                </span>
              </Link>
            );
          })}
        </div>
      )}
      {!error && !subscriptionsError && !flaggedError && (count ?? 0) > pageSize && (
        <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
          {page > 1 ? <Link href={`/admin/businesses?page=${page - 1}`} className="hover:text-slate-700">Previous</Link> : <span />}
          <span>Page {page} of {Math.ceil((count ?? 0) / pageSize)}</span>
          {page * pageSize < (count ?? 0) ? <Link href={`/admin/businesses?page=${page + 1}`} className="hover:text-slate-700">Next</Link> : <span />}
        </div>
      )}
    </div>
  );
}
