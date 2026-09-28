export type RequestedItem = { name: string; quantity: number };

export type CatalogProduct = {
  id: string;
  name: string;
  price: number;
  is_available: boolean;
  stock_quantity: number | null;
};

export type ResolvedItem = { product_id: string; name: string; quantity: number; unit_price: number };

export type ResolveResult =
  | { ok: true; items: ResolvedItem[]; total: number }
  | { ok: false; reason: "empty" | "too_many" | "invalid_quantity" | "unknown" | "ambiguous" | "unavailable"; itemName?: string; options?: string[] };

const MAX_DISTINCT_ITEMS = 20;
const MAX_QUANTITY = 1000;

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

/**
 * Maps what the model said the customer wants onto real catalog rows. The
 * model only ever supplies names and quantities; ids, names and prices come
 * from the catalog, so a hallucinated or hostile tool call can't invent a
 * product or a price. (place_order_atomic re-checks all of this in SQL.)
 */
export function resolveOrderItems(requested: RequestedItem[], catalog: CatalogProduct[]): ResolveResult {
  if (!Array.isArray(requested) || requested.length === 0) return { ok: false, reason: "empty" };
  if (requested.length > MAX_DISTINCT_ITEMS) return { ok: false, reason: "too_many" };

  const merged = new Map<string, ResolvedItem>();

  for (const raw of requested) {
    const wanted = normalize(String(raw?.name ?? ""));
    const quantity = Number(raw?.quantity ?? 1);
    if (!wanted) return { ok: false, reason: "unknown", itemName: String(raw?.name ?? "") };
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
      return { ok: false, reason: "invalid_quantity", itemName: String(raw.name) };
    }

    const exact = catalog.filter((p) => normalize(p.name) === wanted);
    const partial =
      exact.length > 0
        ? exact
        : catalog.filter((p) => {
            const name = normalize(p.name);
            return name.includes(wanted) || wanted.includes(name);
          });

    if (partial.length === 0) return { ok: false, reason: "unknown", itemName: String(raw.name) };
    if (partial.length > 1) {
      return { ok: false, reason: "ambiguous", itemName: String(raw.name), options: partial.slice(0, 5).map((p) => p.name) };
    }

    const product = partial[0];
    const existing = merged.get(product.id);
    const nextQuantity = (existing?.quantity ?? 0) + quantity;
    if (nextQuantity > MAX_QUANTITY) return { ok: false, reason: "invalid_quantity", itemName: product.name };

    if (!product.is_available || (product.stock_quantity != null && product.stock_quantity < nextQuantity)) {
      return { ok: false, reason: "unavailable", itemName: product.name };
    }

    merged.set(product.id, {
      product_id: product.id,
      name: product.name,
      quantity: nextQuantity,
      unit_price: Number(product.price),
    });
  }

  const items = [...merged.values()];
  const total = items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
  return { ok: true, items, total };
}
