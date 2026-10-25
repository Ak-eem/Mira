"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createOrder, updateOrderStatus } from "./actions";
import { linkCourierReference } from "../settings/courier-actions";
import { ORDER_STATUSES, OPEN_ORDER_STATUSES, type OrderStatus } from "@/lib/orders/status";

type OrderItem = { name: string; quantity: number; unit_price: number | null };
type Order = {
  id: string;
  customer_identifier: string;
  status: OrderStatus;
  total: number | null;
  status_changed_at: string;
  source?: "manual" | "ai";
  note?: string | null;
  order_items: OrderItem[];
};

const STATUS_OPTIONS: readonly OrderStatus[] = ORDER_STATUSES;

type Shipment = { reference: string; status: string };

const SHIPMENT_LABELS: Record<string, string> = {
  pending: "Waiting for pickup",
  booked: "Booked",
  picked_up: "Picked up",
  in_transit: "On its way",
  delivered: "Delivered",
  failed: "Delivery failed",
  cancelled: "Cancelled",
};

// Attach the reference Shiip gave the owner when they booked this delivery
// in Shiip. From then on Shiip's updates reach this order on their own.
function CourierLink({ businessId, orderId }: { businessId: string; orderId: string }) {
  const router = useRouter();
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const result = await linkCourierReference(businessId, orderId, "shiip", reference);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setReference("");
    router.refresh();
  }

  return (
    <form onSubmit={handleLink} className="mt-2 space-y-1">
      <div className="flex gap-2">
        <input
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="Shiip reference, e.g. 72d4iejm4lg0"
          aria-label="Shiip delivery reference"
          disabled={busy}
          className="ui-field min-w-0 flex-1 font-mono !text-xs"
        />
        <button
          type="submit"
          disabled={busy || !reference.trim()}
          className="shrink-0 ui-btn ui-btn-secondary ui-btn-sm disabled:opacity-50"
        >
          {busy ? "Adding…" : "Track delivery"}
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </form>
  );
}

type RecentConversation = { identifier: string; label: string };

function NewOrderForm({
  businessId,
  recentConversations,
}: {
  businessId: string;
  recentConversations: RecentConversation[];
}) {
  const [selectedConversation, setSelectedConversation] = useState("");
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

    const result = await createOrder({
      businessId,
      customerIdentifier,
      selectedConversationIdentifier: selectedConversation || undefined,
      status,
      items,
    });

    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }

    setSelectedConversation("");
    setCustomerIdentifier("");
    setStatus("placed");
    setItems([{ name: "", quantity: "1", unitPrice: "" }]);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 ui-card">
      <p className="font-medium text-slate-900">Log an order</p>

      <div>
        <label className="block text-xs font-medium text-slate-600">Customer</label>
        <select
          className="mt-1 w-full ui-field"
          value={selectedConversation}
          onChange={(e) => setSelectedConversation(e.target.value)}
        >
          <option value="">
            {recentConversations.length > 0 ? "-- pick a recent chat, or enter a phone number below --" : "No recent chats yet"}
          </option>
          {recentConversations.map((c) => (
            <option key={c.identifier} value={c.identifier}>
              {c.label}
            </option>
          ))}
        </select>
        {/* Web-chat customers (no WhatsApp number at all) can only be
            linked to an order by picking their chat above -- there's
            nothing to type in for them. The phone field below only
            matters for a WhatsApp customer without a chat on record yet. */}
        {!selectedConversation && (
          <input
            className="mt-2 w-full ui-field font-mono"
            placeholder="or enter a WhatsApp number, e.g. 2348012345678"
            value={customerIdentifier}
            onChange={(e) => setCustomerIdentifier(e.target.value)}
          />
        )}
      </div>

      <div className="space-y-2">
        <label className="block text-xs font-medium text-slate-600">Items</label>
        {items.map((item, i) => (
          <div key={i} className="flex gap-2">
            <input
              className="w-1/2 ui-field"
              placeholder="Item name"
              value={item.name}
              onChange={(e) => updateItem(i, "name", e.target.value)}
            />
            <input
              className="w-1/4 ui-field"
              placeholder="Qty"
              value={item.quantity}
              onChange={(e) => updateItem(i, "quantity", e.target.value)}
            />
            <input
              className="w-1/4 ui-field"
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
          className="mt-1 ui-field"
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
        className="ui-btn ui-btn-primary"
      >
        {submitting ? "Saving…" : "Log order"}
      </button>
    </form>
  );
}

function OrderRow({
  businessId,
  order,
  shipment,
  courierConnected,
}: {
  businessId: string;
  order: Order;
  shipment?: Shipment;
  courierConnected: boolean;
}) {
  const [status, setStatus] = useState(order.status);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleStatusChange(next: OrderStatus) {
    const previous = status;
    setStatus(next);
    setUpdating(true);
    setError(null);
    const result = await updateOrderStatus(businessId, order.id, next);
    setUpdating(false);
    if (result.error) {
      setStatus(previous);
      setError(result.error);
    }
  }

  const awaitingConfirmation = status === "placed" && order.source === "ai";

  return (
    <li
      className={`ui-card !p-4 ${
        awaitingConfirmation ? "!shadow-[0_0_0_2px_rgb(252_211_77)]" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs text-slate-500">
          {order.customer_identifier.replace(/^(wa_|web_|email_)/, "")}
          {order.source === "ai" && (
            <span className="ui-section-label !ml-0">
              Taken by Mira
            </span>
          )}
        </span>
        <div className="flex items-center gap-2">
          {awaitingConfirmation && (
            <button
              type="button"
              disabled={updating}
              onClick={() => handleStatusChange("confirmed")}
              className="ui-btn ui-btn-primary ui-btn-sm"
            >
              Confirm order
            </button>
          )}
          <select
            value={status}
            disabled={updating}
            onChange={(e) => handleStatusChange(e.target.value as OrderStatus)}
            className="ui-btn ui-btn-secondary ui-btn-sm"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="mt-1 text-sm text-slate-700">
        {order.order_items.map((item) => `${item.quantity > 1 ? `${item.quantity} × ` : ""}${item.name}`).join(", ") || "(no items)"}
      </p>
      {order.note && <p className="mt-1 text-xs text-slate-500">Note: {order.note}</p>}
      <p className="mt-1 text-xs text-slate-500">
        ₦{Number(order.total ?? 0).toLocaleString()} · {new Date(order.status_changed_at).toLocaleString()}
      </p>
      {awaitingConfirmation && (
        <p className="mt-1 text-xs text-amber-700">
          Awaiting your confirmation. The customer&apos;s chat is flagged until you confirm or cancel.
        </p>
      )}
      {shipment ? (
        <p className="mt-2 text-xs text-slate-600">
          Shiip <span className="font-mono text-slate-500">{shipment.reference}</span> ·{" "}
          <span className="font-medium">{SHIPMENT_LABELS[shipment.status] ?? shipment.status}</span>
        </p>
      ) : (
        courierConnected &&
        (OPEN_ORDER_STATUSES as readonly OrderStatus[]).includes(status) && (
          <CourierLink businessId={businessId} orderId={order.id} />
        )
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </li>
  );
}

export function OrdersPanel({
  businessId,
  orders,
  recentConversations,
  courierConnected = false,
  shipments = {},
}: {
  businessId: string;
  orders: Order[];
  recentConversations: RecentConversation[];
  courierConnected?: boolean;
  shipments?: Record<string, Shipment>;
}) {
  return (
    <div className="space-y-6">
      <NewOrderForm businessId={businessId} recentConversations={recentConversations} />

      <div>
        <p className="mb-3 font-medium text-slate-900">Recent orders</p>
        {orders.length === 0 ? (
          <p className="ui-card !p-5 text-sm text-slate-500">
            No orders logged yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {orders.map((order) => (
              <OrderRow
                key={order.id}
                businessId={businessId}
                order={order}
                shipment={shipments[order.id]}
                courierConnected={courierConnected}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
