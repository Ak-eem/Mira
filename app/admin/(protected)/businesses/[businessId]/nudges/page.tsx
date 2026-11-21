import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { ErrorNotice } from "@/components/ErrorNotice";

export const dynamic = "force-dynamic";

const TRIGGER_LABEL: Record<string, string> = {
  order_shipped: "Order shipped",
  abandoned_cart: "Abandoned cart",
  restock_alert: "Back in stock",
};

// Read-only: the nudge rules the owner has set and how the sends are doing. Nothing here changes anything.
export default async function AdminNudgesPage({ params }: { params: Promise<{ businessId: string }> | { businessId: string } }) {
  const { businessId } = await Promise.resolve(params);
  const supabase = await createClient();

  const [{ data: rules, error: rulesError }, { data: subscription }, { data: sends, error: sendsError }] = await Promise.all([
    supabase.from("nudge_rules").select("trigger_type, template_name, is_active").eq("business_id", businessId),
    supabase.from("business_subscriptions").select("nudges_addon, nudges_tier").eq("business_id", businessId).maybeSingle(),
    supabase.from("nudge_sends").select("status").eq("business_id", businessId),
  ]);

  const total = sends?.length ?? 0;
  const delivered = (sends ?? []).filter((s) => ["delivered", "read", "replied"].includes(s.status)).length;
  const replied = (sends ?? []).filter((s) => s.status === "replied").length;
  const failed = (sends ?? []).filter((s) => s.status === "failed").length;

  return (
    <div className="space-y-6">
      <PageHeader title="Nudges" subtitle="Follow-up messages this business sends to its customers. View only." />
      {rulesError && <ErrorNotice what="load nudge rules" error={rulesError} />}
      {sendsError && <ErrorNotice what="load nudge history" error={sendsError} />}

      <div className={`glass-panel rounded-[18px] px-5 py-4 text-sm ${subscription?.nudges_addon ? "" : "border border-marigold"}`}>
        {subscription?.nudges_addon
          ? <>Nudges add-on is <span className="font-semibold text-ink">on</span> ({subscription.nudges_tier ?? "no tier"}).</>
          : <>The Nudges add-on is <span className="font-semibold text-ink">off</span>, so nothing sends. Turn it on in Settings under Subscription.</>}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[["Sent", total], ["Delivered", delivered], ["Replied", replied], ["Failed", failed]].map(([label, value]) => (
          <div key={label} className="glass-panel rounded-[18px] px-5 py-4">
            <p className="text-3xl font-semibold tracking-tight text-ink">{value}</p>
            <p className="mt-1 text-xs text-muted">{label}</p>
          </div>
        ))}
      </div>

      <section className="glass-panel rounded-[18px] p-5">
        <h2 className="mb-3 text-sm font-semibold text-ink">Rules</h2>
        {(rules ?? []).length === 0 ? (
          <p className="text-sm text-muted">The owner hasn&apos;t set up any rules.</p>
        ) : (
          <ul className="space-y-2">
            {(rules ?? []).map((rule) => (
              <li key={rule.trigger_type} className="flex items-center justify-between gap-3 rounded-xl bg-mist/60 px-3 py-2 text-sm text-ink">
                <span>{TRIGGER_LABEL[rule.trigger_type] ?? rule.trigger_type}</span>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${rule.is_active ? "bg-lime text-ink" : "bg-mist text-muted"}`}>{rule.is_active ? "On" : "Off"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
