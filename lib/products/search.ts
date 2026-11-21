import type { SupabaseClient } from "@supabase/supabase-js";

export type FoundProduct = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  stock_quantity: number | null;
  is_available: boolean;
  availability_note: string | null;
  image_url: string | null;
};

// Looks up the products that best match what a customer wrote, using the database's search
// (migration 0078). Returns [] when the search is not there yet or fails: the chat then simply
// carries on with the part of the catalogue it already has, so a missing migration never breaks a reply.
export async function searchProducts(client: SupabaseClient, businessId: string, query: string, limit = 12): Promise<FoundProduct[]> {
  const text = query.trim();
  if (text.length < 2) return [];
  const { data, error } = await client.rpc("search_products", { p_business_id: businessId, p_query: text, p_limit: limit });
  if (error) {
    console.error("product search failed:", error.message);
    return [];
  }
  return ((data ?? []) as FoundProduct[]).map((p) => ({ ...p, price: Number(p.price) }));
}

// Same line format as the catalogue section of the prompt, so the model reads both alike.
export function productSearchLines(products: FoundProduct[], currency: string): string[] {
  return products.map((product) => {
    const stock = product.stock_quantity == null ? "" : product.stock_quantity > 0 ? `, ${product.stock_quantity} in stock` : ", OUT OF STOCK";
    const availability = product.is_available ? `available${stock}` : `unavailable${product.availability_note ? ` — ${product.availability_note}` : ""}`;
    const photo = product.image_url ? " [has photo]" : "";
    return `- ${product.name}: ${currency} ${product.price} (${availability})${product.description ? ` — ${product.description}` : ""}${photo}`;
  });
}
