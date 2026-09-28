export const ORDER_STATUSES = ["cart", "placed", "confirmed", "shipped", "delivered", "cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

// 'cart' is an in-progress state the customer never asked to hear about.
export type NotifiableOrderStatus = Exclude<OrderStatus, "cart">;

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === "string" && (ORDER_STATUSES as readonly string[]).includes(value);
}

export function isNotifiableStatus(status: OrderStatus): status is NotifiableOrderStatus {
  return status !== "cart";
}

// Statuses in which a customer can still mark the order delivered.
export const CUSTOMER_DELIVERABLE_STATUSES: readonly OrderStatus[] = ["confirmed", "shipped"];

// Statuses that mean "this order is still in flight".
export const OPEN_ORDER_STATUSES: readonly OrderStatus[] = ["placed", "confirmed", "shipped"];

export function currencySymbol(currency: string): string {
  return currency === "NGN" ? "₦" : `${currency} `;
}

export function formatMoney(amount: number, currency: string): string {
  return `${currencySymbol(currency)}${amount.toLocaleString()}`;
}
