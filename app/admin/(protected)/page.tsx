import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Business } from "@/lib/types";
import { subscriptionLabel, type BusinessSubscription, type SubscriptionStatus } from "@/lib/plans";

type FlaggedConversation = {
  id: string;
  business_id: string;
  started_at: string;
  claimed_by: string | null;
};

const STATUS_STYLES: Record<SubscriptionStatus, string> = {
  trialing: "bg-sky-50 text-sky-700 border-sky-200",
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  past_due: "bg-amber-50 text-amber-700 border-amber-200",
  cancelled: "bg-slate-100 text-slate-500 border-slate-200",
};

// Uses the RLS-respecting client (not service-role) — every query here only
// returns rows because the current session passes is_platform_admin().
export default async function AdminOverviewPage() {
  const supabase = await createClient();
  const [{ data: businesses, error }, { data: subscriptions }, { data: flagged }] = await Promise.all([
    supabase
      .from("businesses")
      .select("id, name, slug, is_active, created_at")
      .order("created_at", { ascending: false })
      .returns<(Pick<Business, "id" | "name" | "slug" | "is_active"> & { created_at: string })[]>(),
    supabase
      .from("business_subscriptions")
      .select("business_id, plan, status, trial_started_at, trial_ends_at")
      .returns<(BusinessSubscription & { business_id: string })[]>(),
    supabase
      .from("conversations")
      .select("id, business_id, started_at, claimed_by")
      .eq("needs_human", true)
      .order("started_at", { ascending: true })
      .returns<FlaggedConversation[]>(),
  ]);

  const subscriptionByBusiness = new Map<string, BusinessSubscription>();
  for (const s of subscriptions ?? []) subscriptionByBusiness.set(s.business_id, s);

  const flaggedByBusiness = new Map<string, FlaggedConversation[]>();
  for (const c of flagged ?? []) {
    const list = flaggedByBusiness.get(c.business_id) ?? [];
    list.push(c);
    flaggedByBusiness.set(c.business_id, list);
  }

  const businessNameById = new Map((businesses ?? []).map((b) => [b.id, b.name]));
  const unclaimedFlagged = (flagged ?? []).filter((c) => !c.claimed_by);

  const counts = { trialing: 0, active: 0, past_due: 0, cancelled: 0, none: 0 };
  for (const b of businesses ?? []) {
    const sub = subscriptionByBusiness.get(b.id);
    if (sub) counts[sub.status] += 1;
    else counts.none += 1;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="mb-4 text-xl font-semibold text-slate-900">Overview</h1>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="glass-panel rounded-xl p-5">
            <p className="text-3xl font-semibold tracking-tight text-slate-900">{businesses?.length ?? 0}</p>
            <p className="mt-1 text-sm text-slate-500">Businesses</p>
          </div>
          <div className="glass-panel rounded-xl p-5">
            <p className="text-3xl font-semibold tracking-tight text-sky-700">{counts.trialing}</p>
            <p className="mt-1 text-sm text-slate-500">On trial</p>
          </div>
          <div className="glass-panel rounded-xl p-5">
            <p className="text-3xl font-semibold tracking-tight text-emerald-700">{counts.active}</p>
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
              {unclaimedFlagged.length}
            </p>
            <p className={`mt-1 text-sm ${unclaimedFlagged.length > 0 ? "text-amber-700" : "text-slate-500"}`}>
              Need a human, unclaimed
            </p>
          </div>
        </div>
      </div>

      {unclaimedFlagged.length > 0 && (
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
          {unclaimedFlagged.length > 8 && (
            <p className="mt-2 text-xs text-slate-400">+{unclaimedFlagged.length - 8} more</p>
          )}
        </div>
      )}

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-medium text-slate-900">Businesses</h2>
          <Link
            href="/admin/businesses/new"
            className="glass-hover rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white"
          >
            + New business
          </Link>
        </div>

        {error && <p className="text-sm text-red-600">Couldn&apos;t load businesses: {error.message}</p>}

        {!error && businesses?.length === 0 && (
          <p className="text-sm text-slate-500">No businesses yet — create the first one.</p>
        )}

        {!error && businesses && businesses.length > 0 && (
          <div className="glass-panel divide-y divide-teal-900/10 overflow-hidden rounded-xl">
            {businesses.map((b) => {
              const sub = subscriptionByBusiness.get(b.id);
              const flaggedCount = flaggedByBusiness.get(b.id)?.length ?? 0;
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
                    {!b.is_active && (
                      <span className="text-xs font-medium text-slate-400">Inactive</span>
                    )}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
