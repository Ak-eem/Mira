import { createClient } from "@/lib/supabase/server";
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

  const [{ data: orders, error: ordersError }, recentConversations] = await Promise.all([
    supabase
      .from("orders")
      .select("id, customer_identifier, status, source, note, total, status_changed_at, order_items(name, quantity, unit_price)")
      .eq("business_id", businessId)
      .order("status_changed_at", { ascending: false })
      .limit(50),
    listRecentConversations(businessId),
  ]);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500 shadow-xs">
        Mira writes down orders customers place in chat, so you don&apos;t have to type them in. New shops have this
        on by default; you can switch it off in Settings. Orders Mira takes wait for your confirmation. You can
        still add an order by hand. This is also what Nudges (order shipped / abandoned cart) reads from.
      </div>
      {ordersError && <ErrorNotice what="load your orders" error={ordersError} />}
      <OrdersPanel businessId={businessId} orders={orders ?? []} recentConversations={recentConversations} />
    </div>
  );
}
