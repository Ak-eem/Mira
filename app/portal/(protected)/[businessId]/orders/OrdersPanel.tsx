"use client";

import { useState } from "react";
import { createOrder, updateOrderStatus } from "./actions";

type OrderStatus = "cart" | "placed" | "shipped" | "delivered" | "cancelled";
type OrderItem = { name: string; quantity: number; unit_price: number | null };
type Order = {
  id: string;
  customer_identifier: string;
  status: OrderStatus;
  total: number | null;
  status_changed_at: string;
  order_items: OrderItem[];
};

const STATUS_OPTIONS: OrderStatus[] = ["cart", "placed", "shipped", "delivered", "cancelled"];

function NewOrderForm({ businessId }: { businessId: string }) {
  const [customerIdentifier, setCustomerIdentifier] = useState("");
  const [status, setStatus] = useState<OrderStatus>("placed");
  const [items, setItems] = useState([{ name: "", quantity: "1", unitPrice: "" }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateItem(index: number, field: "name" | "quantity" | "unitPrice", value: string) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const result = await createOrder({ businessId, customerIdentifier, status, items });

    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }

    setCustomerIdentifier("");
    setStatus("placed");
    setItems([{ name: "", quantity: "1", unitPrice: "" }]);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="font-medium text-slate-900">Log an order</p>

      <div>
        <label className="block text-xs font-medium text-slate-600">Customer WhatsApp number</label>
        <input
          className="mt-1 w-full rounded border border-slate-300 px-3 py-2 font-mono text-sm"
          placeholder="e.g. 2348012345678"
          value={customerIdentifier}
          onChange={(e) => setCustomerIdentifier(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <label className="block text-xs font-medium text-slate-600">Items</label>
        {items.map((item, i) => (
          <div key={i} className="flex gap-2">
            <input
              className="w-1/2 rounded border border-slate-300 px-2 py-1.5 text-sm"
              placeholder="Item name"
              value={item.name}
              onChange={(e) => updateItem(i, "name", e.target.value)}
            />
            <input
              className="w-1/4 rounded border border-slate-300 px-2 py-1.5 text-sm"
              placeholder="Qty"
              value={item.quantity}
              onChange={(e) => updateItem(i, "quantity", e.target.value)}
            />
            <input
              className="w-1/4 rounded border border-slate-300 px-2 py-1.5 text-sm"
              placeholder="Unit price"
              value={item.unitPrice}
              onChange={(e) => updateItem(i, "unitPrice", e.target.value)}
            />
          </div>
        ))}
        <button
          type="button"
          onClick={() => setItems((prev) => [...prev, { name: "", quantity: "1", unitPrice: "" }])}
          className="text-xs text-accent hover:underline"
        >
          + Add item
        </button>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-600">Status</label>
        <select
          className="mt-1 rounded border border-slate-300 px-3 py-2 text-sm"
          value={status}
          onChange={(e) => setStatus(e.target.value as OrderStatus)}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-50"
      >
        {submitting ? "Saving…" : "Log order"}
      </button>
    </form>
  );
}

function OrderRow({ businessId, order }: { businessId: string; order: Order }) {
  const [status, setStatus] = useState(order.status);
  const [updating, setUpdating] = useState(false);

  async function handleStatusChange(next: OrderStatus) {
    setStatus(next);
    setUpdating(true);
    await updateOrderStatus(businessId, order.id, next);
    setUpdating(false);
  }

  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-slate-500">{order.customer_identifier.replace(/^wa_/, "")}</span>
        <select
          value={status}
          disabled={updating}
          onChange={(e) => handleStatusChange(e.target.value as OrderStatus)}
          className="rounded border border-slate-300 px-2 py-1 text-xs"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      <p className="mt-1 text-sm text-slate-700">
        {order.order_items.map((item) => item.name).join(", ") || "(no items)"}
      </p>
      <p className="mt-1 text-xs text-slate-400">
        ₦{Number(order.total ?? 0).toLocaleString()} · {new Date(order.status_changed_at).toLocaleString()}
      </p>
    </li>
  );
}

export function OrdersPanel({ businessId, orders }: { businessId: string; orders: Order[] }) {
  return (
    <div className="space-y-6">
      <NewOrderForm businessId={businessId} />

      <div>
        <p className="mb-3 font-medium text-slate-900">Recent orders</p>
        {orders.length === 0 ? (
          <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">
            No orders logged yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {orders.map((order) => (
              <OrderRow key={order.id} businessId={businessId} order={order} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
