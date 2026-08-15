import { createClient } from "@/lib/supabase/server";
import { OrdersPanel } from "./OrdersPanel";

export default async function OrdersPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const supabase = await createClient();

  const { data: orders } = await supabase
    .from("orders")
    .select("id, customer_identifier, status, total, status_changed_at, order_items(name, quantity, unit_price)")
    .eq("business_id", businessId)
    .order("status_changed_at", { ascending: false })
    .limit(50);

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-500">
        Orders are logged here manually for now — Mira doesn&apos;t take orders directly yet. This is what Nudges
        (order shipped / abandoned cart) reads from.
      </div>
      <OrdersPanel businessId={businessId} orders={orders ?? []} />
    </div>
  );
}
