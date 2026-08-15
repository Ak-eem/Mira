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

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-2xl font-semibold">{conversationCount ?? 0}</p>
          <p className="text-sm text-slate-500">Conversations, last 30 days</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-2xl font-semibold">{needsHumanCount ?? 0}</p>
          <p className="text-sm text-slate-500">
            Need you now —{" "}
            <Link href={`/portal/${businessId}/conversations`} className="text-accent hover:underline">
              view
            </Link>
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="font-medium">Nudges</p>
          {!nudgesActive && <span className="text-xs text-slate-400">Not active on this plan</span>}
        </div>
        {nudgesActive ? (
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <p className="text-lg font-semibold">{nudgesSent ?? 0}</p>
              <p className="text-slate-500">Sent (30d)</p>
            </div>
            <div>
              <p className="text-lg font-semibold">{nudgesDelivered ?? 0}</p>
              <p className="text-slate-500">Delivered</p>
            </div>
            <div>
              <p className="text-lg font-semibold">{nudgesReplied ?? 0}</p>
              <p className="text-slate-500">Replied</p>
            </div>
            <div>
              <p className="text-lg font-semibold">{nudgesOptedOut ?? 0}</p>
              <p className="text-slate-500">Opted out (all time)</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            Ask Mira's team to turn on the Nudges add-on to send WhatsApp updates automatically.
          </p>
        )}
        {nudgesActive && (
          <Link href={`/portal/${businessId}/nudges`} className="mt-3 inline-block text-sm text-accent hover:underline">
            Manage nudges →
          </Link>
        )}
      </div>
    </div>
  );
}
