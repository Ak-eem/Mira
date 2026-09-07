import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function PortalDashboardPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const supabase = await createClient();

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [
    { count: conversationCount },
    { count: needsHumanCount },
    { data: subscription },
    { count: nudgesSent },
    { count: nudgesDelivered },
    { count: nudgesReplied },
    { count: nudgesOptedOut },
  ] = await Promise.all([
    supabase
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .gte("started_at", thirtyDaysAgo),
    supabase
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .eq("needs_human", true),
    supabase
      .from("business_subscriptions")
      .select("nudges_addon, plan, nudges_tier")
      .eq("business_id", businessId)
      .maybeSingle(),
    supabase
      .from("nudge_sends")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .gte("sent_at", thirtyDaysAgo),
    supabase
      .from("nudge_sends")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .gte("sent_at", thirtyDaysAgo)
      .in("status", ["delivered", "read", "replied"]),
    supabase
      .from("nudge_sends")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .gte("sent_at", thirtyDaysAgo)
      .eq("status", "replied"),
    supabase.from("nudge_opt_outs").select("business_id", { count: "exact", head: true }).eq("business_id", businessId),
  ]);

  const nudgesActive = subscription?.nudges_addon === true;
  const needsYou = needsHumanCount ?? 0;

  return (
    <div className="space-y-8">
      <div>
        <p className="mb-3 text-sm font-medium text-slate-500">Last 30 days</p>
        <div className="grid grid-cols-2 gap-4">
          <div className="glass-panel rounded-xl p-5">
            <p className="text-3xl font-semibold tracking-tight text-slate-900">{conversationCount ?? 0}</p>
            <p className="mt-1 text-sm text-slate-500">Conversations</p>
          </div>
          <Link
            href={`/portal/${businessId}/conversations`}
            className={`glass-hover rounded-xl p-5 transition ${
              needsYou > 0
                ? "glass-alert-pulse border border-amber-300/50 bg-amber-50/70 backdrop-blur-md"
                : "glass-panel"
            }`}
          >
            <p className={`text-3xl font-semibold tracking-tight ${needsYou > 0 ? "text-amber-700" : "text-slate-900"}`}>
              {needsYou}
            </p>
            <p className={`mt-1 text-sm ${needsYou > 0 ? "text-amber-700" : "text-slate-500"}`}>
              {needsYou > 0 ? "Need you now →" : "Need you now"}
            </p>
          </Link>
        </div>
      </div>

      <div className="glass-panel rounded-xl p-5">
        <div className="mb-4 flex items-center justify-between">
          <p className="font-medium text-slate-900">Nudges</p>
          {!nudgesActive && (
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">Not active</span>
          )}
        </div>

        {nudgesActive ? (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <p className="text-xl font-semibold text-slate-900">{nudgesSent ?? 0}</p>
                <p className="text-xs text-slate-500">Sent</p>
              </div>
              <div>
                <p className="text-xl font-semibold text-slate-900">{nudgesDelivered ?? 0}</p>
                <p className="text-xs text-slate-500">Delivered</p>
              </div>
              <div>
                <p className="text-xl font-semibold text-slate-900">{nudgesReplied ?? 0}</p>
                <p className="text-xs text-slate-500">Replied</p>
              </div>
              <div>
                <p className="text-xl font-semibold text-slate-900">{nudgesOptedOut ?? 0}</p>
                <p className="text-xs text-slate-500">Opted out, all time</p>
              </div>
            </div>
            <Link
              href={`/portal/${businessId}/nudges`}
              className="mt-4 inline-block text-sm font-medium text-accent hover:underline"
            >
              Manage nudges →
            </Link>
          </>
        ) : (
          <p className="text-sm text-slate-500">
            Ask Mira&apos;s team to turn on the Nudges add-on to send WhatsApp updates automatically.
          </p>
        )}
      </div>
    </div>
  );
}
