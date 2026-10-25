import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { ErrorNotice } from "@/components/ErrorNotice";
import { OrdersPanel } from "./OrdersPanel";
import { listRecentConversations } from "./actions";

export default async function OrdersPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const supabase = await createClient();

  const [{ data: orders, error: ordersError }, recentConversations, shipmentsResult, courierResult] = await Promise.all([
    supabase
      .from("orders")
      .select("id, customer_identifier, status, source, note, total, status_changed_at, order_items(name, quantity, unit_price)")
      .eq("business_id", businessId)
      .order("status_changed_at", { ascending: false })
      .limit(50),
    listRecentConversations(businessId),
    // Newest first, so the first row seen per order below is its latest shipment.
    supabase
      .from("order_shipments")
      .select("order_id, courier_reference, status")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false }),
    supabase
      .from("business_logistics_accounts")
      .select("id")
      .eq("business_id", businessId)
      .eq("provider", "shiip")
      .eq("status", "active")
      .maybeSingle(),
  ]);

  // Both reads fail harmlessly if the courier migration isn't applied yet:
  // the feature just doesn't show, and orders work exactly as before.
  const courierConnected = !courierResult.error && Boolean(courierResult.data);
  const shipments: Record<string, { reference: string; status: string }> = {};
  if (!shipmentsResult.error) {
    for (const row of shipmentsResult.data ?? []) {
      if (!row.courier_reference || shipments[row.order_id]) continue;
      shipments[row.order_id] = { reference: row.courier_reference, status: row.status };
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Orders" subtitle="When a customer orders in chat, Mira writes the order down here. Check new orders and confirm them. You can switch this off in Settings, and you can still add an order by hand. Nudges (order shipped, abandoned cart) read from this list." />
      {ordersError && <ErrorNotice what="load your orders" error={ordersError} />}
      <OrdersPanel
        businessId={businessId}
        orders={orders ?? []}
        recentConversations={recentConversations}
        courierConnected={courierConnected}
        shipments={shipments}
      />
    </div>
  );
}
