import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { ErrorNotice } from "@/components/ErrorNotice";
import { customerLabel } from "@/lib/customerLabel";
import { formatMoney } from "@/lib/orders/status";

export const dynamic = "force-dynamic";

type OrderRow = {
  id: string;
  customer_identifier: string | null;
  status: string;
  source: string | null;
  total: number | string;
  status_changed_at: string;
  order_items: { name: string; quantity: number }[] | null;
};

const STATUS_STYLE: Record<string, string> = {
  placed: "bg-marigold/25 text-ink",
  confirmed: "bg-mist text-ink",
  shipped: "bg-mist text-ink",
  delivered: "bg-lime text-ink",
  cancelled: "bg-mist text-muted",
  cart: "bg-mist text-muted",
};

// Read-only: what the owner sees on their Orders page, without the customers' messages. Changing an order's
// status stays with the owner; Mira staff look here to understand how a business is doing.
export default async function AdminOrdersPage({ params }: { params: Promise<{ businessId: string }> | { businessId: string } }) {
  const { businessId } = await Promise.resolve(params);
  const supabase = await createClient();

  const [{ data: business }, { data: orders, error }] = await Promise.all([
    supabase.from("businesses").select("currency").eq("id", businessId).maybeSingle(),
    supabase
      .from("orders")
      .select("id, customer_identifier, status, source, total, status_changed_at, order_items(name, quantity)")
      .eq("business_id", businessId)
      .order("status_changed_at", { ascending: false })
      .limit(100),
  ]);
  const currency = business?.currency ?? "NGN";
  const rows = (orders ?? []) as OrderRow[];

  const counts = rows.reduce<Record<string, number>>((acc, o) => ({ ...acc, [o.status]: (acc[o.status] ?? 0) + 1 }), {});
  const open = (counts.placed ?? 0) + (counts.confirmed ?? 0) + (counts.shipped ?? 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Orders" subtitle="The business's latest 100 orders. View only; the owner manages them from their portal." />
      {error && <ErrorNotice what="load orders" error={error} />}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Recent orders", rows.length],
          ["Open", open],
          ["Delivered", counts.delivered ?? 0],
          ["Cancelled", counts.cancelled ?? 0],
        ].map(([label, value]) => (
          <div key={label} className="glass-panel rounded-[18px] px-5 py-4">
            <p className="text-3xl font-semibold tracking-tight text-ink">{value}</p>
            <p className="mt-1 text-xs text-muted">{label}</p>
          </div>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="glass-panel rounded-[18px] p-6 text-sm text-muted">No orders yet.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((order) => {
            const items = (order.order_items ?? []).map((i) => `${i.quantity}× ${i.name}`).join(", ");
            return (
              <li key={order.id} className="glass-panel flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-[18px] px-5 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{customerLabel(order.customer_identifier)}</p>
                  <p className="truncate text-xs text-muted">{items || "No items"}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted">{new Date(order.status_changed_at).toLocaleDateString("en-NG", { day: "numeric", month: "short" })}</span>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${STATUS_STYLE[order.status] ?? STATUS_STYLE.cart}`}>{order.status}</span>
                  <span className="text-sm font-semibold text-ink">{formatMoney(Number(order.total), currency)}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
