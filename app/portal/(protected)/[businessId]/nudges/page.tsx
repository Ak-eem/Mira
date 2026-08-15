import { createClient } from "@/lib/supabase/server";
import { NudgesPanel } from "./NudgesPanel";

export default async function NudgesPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const supabase = await createClient();

  const [{ data: rules }, { data: subscription }, { data: nudgeSends }] = await Promise.all([
    supabase
      .from("nudge_rules")
      .select("trigger_type, template_name, condition_json, is_active")
      .eq("business_id", businessId),
    supabase
      .from("business_subscriptions")
      .select("nudges_addon, nudges_tier")
      .eq("business_id", businessId)
      .maybeSingle(),
    supabase
      .from("nudge_sends")
      .select("status, order_id, orders(total, status)")
      .eq("business_id", businessId),
  ]);

  const sent = nudgeSends?.length ?? 0;
  const delivered = (nudgeSends ?? []).filter((s) => ["delivered", "read", "replied"].includes(s.status)).length;
  const replied = (nudgeSends ?? []).filter((s) => s.status === "replied").length;

  // Rough heuristic, not a real attribution model: orders that got a
  // nudge tied to them and later converted (not still sitting in 'cart',
  // not cancelled). Correlation, not proof the nudge caused the sale --
  // labeled as an estimate in the UI on purpose. Same array-vs-object
  // embed inference caveat as portal-auth.ts.
  const estimatedRevenueImpact = (nudgeSends ?? [])
    .filter((s) => s.order_id && s.orders)
    .reduce((total, s) => {
      const order = Array.isArray(s.orders) ? s.orders[0] : s.orders;
      if (!order || ["cart", "cancelled"].includes(order.status)) return total;
      return total + Number(order.total ?? 0);
    }, 0);

  return (
    <div className="space-y-6">
      {!subscription?.nudges_addon && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 shadow-sm">
          The Nudges add-on isn&apos;t active on your plan yet — rules can be set up below, but nothing sends until
          it&apos;s turned on.
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="mb-4 font-medium text-slate-900">Last 30 days</p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-xl font-semibold text-slate-900">{sent}</p>
            <p className="text-xs text-slate-500">Sent</p>
          </div>
          <div>
            <p className="text-xl font-semibold text-slate-900">{delivered}</p>
            <p className="text-xs text-slate-500">Delivered</p>
          </div>
          <div>
            <p className="text-xl font-semibold text-slate-900">{replied}</p>
            <p className="text-xs text-slate-500">Replied</p>
          </div>
          <div>
            <p className="text-xl font-semibold text-slate-900">₦{estimatedRevenueImpact.toLocaleString()}</p>
            <p className="text-xs text-slate-500">Est. revenue impact</p>
          </div>
        </div>
      </div>

      <NudgesPanel businessId={businessId} rules={rules ?? []} />
    </div>
  );
}
