import type { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { ProductImageRef } from "./matchProductImages";

// Fire-and-forget by design, same spirit as the image cleanup in
// products/actions.ts -- a failed write here shouldn't turn into a
// customer-visible error, it just means a later restock_alert nudge
// won't know this particular customer asked about the product.
export async function recordProductInterest(
  supabase: ReturnType<typeof createServiceRoleClient>,
  businessId: string,
  customerIdentifier: string,
  productImages: ProductImageRef[],
): Promise<void> {
  if (productImages.length === 0) return;

  const rows = productImages.map((p) => ({
    business_id: businessId,
    product_id: p.productId,
    customer_identifier: customerIdentifier,
  }));

  const { error } = await supabase.from("product_interest").insert(rows);
  if (error) console.error("Failed to record product interest:", error);
}
