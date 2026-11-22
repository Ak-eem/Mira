"use server";

import { revalidatePath } from "next/cache";
import { parseProductsCsv } from "@/lib/products/csvImport";
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

// Bulk-add products from a checked spreadsheet. The rows are checked again here on the server
// (never trust the browser), products whose name already exists are skipped so importing the same
// file twice cannot create duplicates, and everything goes in with one database call.
export async function importProducts(input: { businessId: string; csv: string }): Promise<{
  error: string | null;
  imported: number;
  skippedExisting: number;
}> {
  const editor = await getCurrentEditor();
  if (!editor) return { error: "Not authenticated.", imported: 0, skippedExisting: 0 };

  const parsed = parseProductsCsv(input.csv);
  if (parsed.fatal) return { error: parsed.fatal, imported: 0, skippedExisting: 0 };
  if (parsed.rows.length === 0) return { error: "There are no valid products in that file.", imported: 0, skippedExisting: 0 };

  const supabase = await createClient();
  const { data: existing, error: existingError } = await supabase
    .from("products")
    .select("name")
    .eq("business_id", input.businessId)
    .limit(10000);
  if (existingError) return { error: existingError.message, imported: 0, skippedExisting: 0 };

  const have = new Set((existing ?? []).map((p) => p.name.trim().toLowerCase()));
  const fresh = parsed.rows.filter((row) => !have.has(row.name.toLowerCase()));
  const skippedExisting = parsed.rows.length - fresh.length;
  if (fresh.length === 0) return { error: null, imported: 0, skippedExisting };

  const { error } = await supabase.from("products").insert(
    fresh.map((row) => ({
      business_id: input.businessId,
      name: row.name,
      description: row.description || null,
      price: row.price,
      stock_quantity: row.stockQuantity,
      is_available: row.stockQuantity === null || row.stockQuantity > 0,
    })),
  );
  if (error) return { error: error.message, imported: 0, skippedExisting: 0 };

  await logActivity(input.businessId, "product", null, "created", `${editor.email} imported ${fresh.length} products from a spreadsheet`, "admin_ui");
  revalidatePath(`/admin/businesses/${input.businessId}/products`);
  revalidatePath(`/portal/${input.businessId}/products`);
  return { error: null, imported: fresh.length, skippedExisting };
}
