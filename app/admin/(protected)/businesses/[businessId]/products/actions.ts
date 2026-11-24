"use server";

import { revalidatePath } from "next/cache";
import { parseProductsCsv, type ImportParse, type ImportRow } from "@/lib/products/csvImport";
import { SHOPIFY_MAX_PAGES, SHOPIFY_PAGE_SIZE, normalizeShopUrl, parseShopifyPages } from "@/lib/products/shopifyImport";
import { fetchUrl } from "@/lib/ai/urlFetch";
import { getCurrentEditor } from "@/lib/supabase/editor-auth";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activityLog";
import { applyProductUpdate, applyProductCreate } from "@/lib/products";

export async function createProduct(input: {
  businessId: string;
  name: string;
  description: string;
  price: string;
  stockQuantity: string;
  isAvailable: boolean;
  availabilityNote: string;
  source?: "admin_ui" | "command_center";
}) {
  const editor = await getCurrentEditor();
  if (!editor) return { error: "Not authenticated.", id: null };

  return applyProductCreate({
    businessId: input.businessId,
    name: input.name,
    description: input.description,
    price: input.price,
    stockQuantity: input.stockQuantity,
    isAvailable: input.isAvailable,
    availabilityNote: input.availabilityNote,
    source: input.source ?? "admin_ui",
    actorLabel: editor.email,
  });
}

export async function updateProduct(input: {
  productId: string;
  name: string;
  description: string;
  price: string;
  stockQuantity: string;
  isAvailable: boolean;
  availabilityNote: string;
  source?: "admin_ui" | "command_center";
}) {
  const editor = await getCurrentEditor();
  if (!editor) return { error: "Not authenticated." };

  return applyProductUpdate({
    productId: input.productId,
    name: input.name,
    description: input.description,
    price: input.price,
    stockQuantity: input.stockQuantity,
    isAvailable: input.isAvailable,
    availabilityNote: input.availabilityNote,
    source: input.source ?? "admin_ui",
    actorLabel: editor.email,
  });
}

export async function deleteProduct(productId: string) {
  const editor = await getCurrentEditor();
  if (!editor) return { error: "Not authenticated." };

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("products")
    .select("name, business_id, image_url")
    .eq("id", productId)
    .maybeSingle();

  const { error } = await supabase.from("products").delete().eq("id", productId);
  if (error) return { error: error.message };

  // Best-effort, same as the replace/remove flows: the row is already gone, so
  // a failed cleanup only leaves one orphaned file in the bucket.
  const imagePath = existing?.image_url?.split("/product-images/")[1];
  if (imagePath) {
    await supabase.storage.from("product-images").remove([imagePath]);
  }

  if (existing) {
    await logActivity(existing.business_id, "product", productId, "deleted", `"${existing.name}" removed`);
  }

  return { error: null };
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_EXTENSION_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export async function uploadProductImage(productId: string, formData: FormData) {
  const editor = await getCurrentEditor();
  if (!editor) return { error: "Not authenticated." };

  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "No image file was provided." };
  }

  const extension = IMAGE_EXTENSION_BY_TYPE[file.type];
  if (!extension) {
    return { error: "Image must be JPEG, PNG, WebP, or GIF." };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { error: "Image must be 5MB or smaller." };
  }

  const supabase = await createClient();

  const { data: product } = await supabase
    .from("products")
    .select("business_id, name, image_url")
    .eq("id", productId)
    .maybeSingle();

  if (!product) return { error: "Product not found." };

  const path = `${product.business_id}/${productId}-${Date.now()}.${extension}`;
  const { error: uploadError } = await supabase.storage
    .from("product-images")
    .upload(path, file, { contentType: file.type, upsert: false });

  if (uploadError) return { error: uploadError.message };

  const { data: publicUrl } = supabase.storage.from("product-images").getPublicUrl(path);

  const { error: updateError } = await supabase
    .from("products")
    .update({ image_url: publicUrl.publicUrl })
    .eq("id", productId);

  if (updateError) return { error: updateError.message };

  // Best-effort cleanup of the previous image -- if this fails, the bucket
  // just carries one orphaned file, not worth failing the whole upload over.
  if (product.image_url) {
    const previousPath = product.image_url.split("/product-images/")[1];
    if (previousPath) {
      await supabase.storage.from("product-images").remove([previousPath]);
    }
  }

  await logActivity(product.business_id, "product", productId, "updated", `"${product.name}" photo updated`);
  return { error: null, imageUrl: publicUrl.publicUrl };
}

export async function removeProductImage(productId: string) {
  const editor = await getCurrentEditor();
  if (!editor) return { error: "Not authenticated." };

  const supabase = await createClient();

  const { data: product } = await supabase
    .from("products")
    .select("business_id, name, image_url")
    .eq("id", productId)
    .maybeSingle();

  if (!product) return { error: "Product not found." };

  const { error: updateError } = await supabase
    .from("products")
    .update({ image_url: null })
    .eq("id", productId);

  if (updateError) return { error: updateError.message };

  if (product.image_url) {
    const path = product.image_url.split("/product-images/")[1];
    if (path) {
      await supabase.storage.from("product-images").remove([path]);
    }
  }

  await logActivity(product.business_id, "product", productId, "updated", `"${product.name}" photo removed`);
  return { error: null };
}

type ImportResult = { error: string | null; imported: number; skippedExisting: number };

// Shared by the spreadsheet and Shopify imports. Products whose name already exists are skipped so importing twice
// cannot create duplicates, and everything goes in with one database call.
async function insertImportRows(businessId: string, rows: ImportRow[], editorEmail: string, source: string): Promise<ImportResult> {
  const supabase = await createClient();
  const { data: existing, error: existingError } = await supabase
    .from("products")
    .select("name")
    .eq("business_id", businessId)
    .limit(10000);
  if (existingError) return { error: existingError.message, imported: 0, skippedExisting: 0 };

  const have = new Set((existing ?? []).map((p) => p.name.trim().toLowerCase()));
  const fresh = rows.filter((row) => !have.has(row.name.toLowerCase()));
  const skippedExisting = rows.length - fresh.length;
  if (fresh.length === 0) return { error: null, imported: 0, skippedExisting };

  const { error } = await supabase.from("products").insert(
    fresh.map((row) => ({
      business_id: businessId,
      name: row.name,
      description: row.description || null,
      price: row.price,
      stock_quantity: row.stockQuantity,
      is_available: row.stockQuantity === null || row.stockQuantity > 0,
      ...(row.imageUrl ? { image_url: row.imageUrl } : {}),
    })),
  );
  if (error) return { error: error.message, imported: 0, skippedExisting: 0 };

  await logActivity(businessId, "product", null, "created", `${editorEmail} imported ${fresh.length} products from ${source}`, "admin_ui");
  revalidatePath(`/admin/businesses/${businessId}/products`);
  revalidatePath(`/portal/${businessId}/products`);
  return { error: null, imported: fresh.length, skippedExisting };
}

// Bulk-add products from a checked spreadsheet. The rows are checked again here on the server (never trust the browser).
export async function importProducts(input: { businessId: string; csv: string }): Promise<ImportResult> {
  const editor = await getCurrentEditor();
  if (!editor) return { error: "Not authenticated.", imported: 0, skippedExisting: 0 };

  const parsed = parseProductsCsv(input.csv);
  if (parsed.fatal) return { error: parsed.fatal, imported: 0, skippedExisting: 0 };
  if (parsed.rows.length === 0) return { error: "There are no valid products in that file.", imported: 0, skippedExisting: 0 };

  return insertImportRows(input.businessId, parsed.rows, editor.email, "a spreadsheet");
}

// Reads a Shopify store's public catalogue (<shop>/products.json). The fetch is the SSRF-safe one used for web research.
async function loadShopifyCatalogue(address: string): Promise<ImportParse> {
  const base = normalizeShopUrl(address);
  if (!base) return { rows: [], problems: [], fatal: "That doesn't look like a website address. Try something like mystore.com." };

  const pages: unknown[] = [];
  try {
    for (let page = 1; page <= SHOPIFY_MAX_PAGES; page += 1) {
      const response = await fetchUrl(`${base}/products.json?limit=${SHOPIFY_PAGE_SIZE}&page=${page}`);
      if (!response.ok) {
        if (page === 1) return { rows: [], problems: [], fatal: "That site doesn't share a product list, so it may not be a Shopify store. Use a spreadsheet instead." };
        break;
      }
      let json: unknown;
      try {
        json = await response.json();
      } catch {
        if (page === 1) return { rows: [], problems: [], fatal: "That site doesn't share a product list, so it may not be a Shopify store. Use a spreadsheet instead." };
        break;
      }
      pages.push(json);
      const count = (json as { products?: unknown[] } | null)?.products?.length ?? 0;
      if (count < SHOPIFY_PAGE_SIZE) break;
    }
  } catch {
    return { rows: [], problems: [], fatal: "Couldn't reach that website. Check the address and try again." };
  }
  return parseShopifyPages(pages);
}

// Step 1: look only, nothing is saved. The owner reviews what was found.
export async function previewShopifyStore(input: { address: string }): Promise<ImportParse> {
  const editor = await getCurrentEditor();
  if (!editor) return { rows: [], problems: [], fatal: "Not authenticated." };
  return loadShopifyCatalogue(input.address);
}

// Step 2: after the owner confirms. The store is read again here on the server rather than trusting rows from the browser.
export async function importFromShopify(input: { businessId: string; address: string }): Promise<ImportResult> {
  const editor = await getCurrentEditor();
  if (!editor) return { error: "Not authenticated.", imported: 0, skippedExisting: 0 };

  const parsed = await loadShopifyCatalogue(input.address);
  if (parsed.fatal) return { error: parsed.fatal, imported: 0, skippedExisting: 0 };
  if (parsed.rows.length === 0) return { error: "There are no usable products on that store.", imported: 0, skippedExisting: 0 };

  return insertImportRows(input.businessId, parsed.rows, editor.email, "a Shopify store");
}
