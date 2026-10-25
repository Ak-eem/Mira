import { fetchCrawlResource } from "@/lib/ai/scrapeBusiness";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

// Copies a scraped product image into Mira's own storage so a product never
// hot-links someone else's site. Throws on anything that isn't a plain
// jpeg/png/webp response. Callers treat a throw as "approve the product
// anyway, without the image", never as "block the approval".
export async function mirrorProductImage(businessId: string, draftId: string, imageUrl: string): Promise<string | null> {
  const resource = await fetchCrawlResource(imageUrl);
  if (resource.status < 200 || resource.status >= 300 || !resource.contentType || !["image/jpeg", "image/png", "image/webp"].includes(resource.contentType)) {
    throw new Error("Product image is not an allowed image response.");
  }
  const extension = resource.contentType === "image/jpeg" ? "jpg" : resource.contentType.slice("image/".length);
  const path = `${businessId}/${draftId}-${Date.now()}.${extension}`;
  const body = new ArrayBuffer(resource.body.byteLength);
  new Uint8Array(body).set(resource.body);
  const storage = createServiceRoleClient().storage.from("product-images");
  const { error } = await storage.upload(path, body, { contentType: resource.contentType, cacheControl: "31536000", upsert: false });
  if (error) throw error;
  return storage.getPublicUrl(path).data.publicUrl;
}
