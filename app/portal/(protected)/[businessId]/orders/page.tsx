import { createClient } from "@/lib/supabase/server";
import { OrdersPanel } from "./OrdersPanel";
import { listRecentConversations } from "./actions";

export default async function OrdersPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const supabase = await createClient();

  const [{ data: orders }, recentConversations] = await Promise.all([
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
      <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500 shadow-sm">
        Orders appear here two ways: you log them manually, or Mira takes them in chat when AI order-taking is
        switched on in Settings. Orders Mira takes wait for your confirmation. This is also what Nudges (order
        shipped / abandoned cart) reads from.
      </div>
      <OrdersPanel businessId={businessId} orders={orders ?? []} recentConversations={recentConversations} />
    </div>
  );
}
