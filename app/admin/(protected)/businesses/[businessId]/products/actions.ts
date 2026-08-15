"use server";

import { getCurrentAdmin } from "@/lib/supabase/admin-auth";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activityLog";

export async function createProduct(input: {
  businessId: string;
  name: string;
  description: string;
  price: string;
  stockQuantity: string;
  isAvailable: boolean;
  availabilityNote: string;
}) {
  const admin = await getCurrentAdmin();
  if (!admin) return { error: "Not authenticated." };

  const name = input.name.trim();
  if (!name) return { error: "Name is required." };

  const price = Number(input.price);
  if (input.price.trim() === "" || Number.isNaN(price) || price < 0) {
    return { error: "Price is required and must be a number 0 or greater." };
  }

  let stockQuantity: number | null = null;
  if (input.stockQuantity.trim() !== "") {
    stockQuantity = Number(input.stockQuantity);
    if (Number.isNaN(stockQuantity) || stockQuantity < 0) {
      return { error: "Stock, if set, must be a whole number 0 or greater." };
    }
  }

  const supabase = await createClient();
  const { data: created, error } = await supabase
    .from("products")
    .insert({
      business_id: input.businessId,
      name,
      description: input.description.trim() || null,
      price,
      stock_quantity: stockQuantity,
      is_available: input.isAvailable,
      availability_note: input.availabilityNote.trim() || null,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  await logActivity(input.businessId, "product", created?.id ?? null, "created", `"${name}" added`);
  return { error: null, id: created?.id ?? null };
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
  const admin = await getCurrentAdmin();
  if (!admin) return { error: "Not authenticated." };

  const name = input.name.trim();
  if (!name) return { error: "Name is required." };

  const price = Number(input.price);
  if (input.price.trim() === "" || Number.isNaN(price) || price < 0) {
    return { error: "Price is required and must be a number 0 or greater." };
  }

  let stockQuantity: number | null = null;
  if (input.stockQuantity.trim() !== "") {
    stockQuantity = Number(input.stockQuantity);
    if (Number.isNaN(stockQuantity) || stockQuantity < 0) {
      return { error: "Stock, if set, must be a whole number 0 or greater." };
    }
  }

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("products")
    .select("name, price, stock_quantity, is_available, business_id")
    .eq("id", input.productId)
    .maybeSingle();

  const { error } = await supabase
    .from("products")
    .update({
      name,
      description: input.description.trim() || null,
      price,
      stock_quantity: stockQuantity,
      is_available: input.isAvailable,
      availability_note: input.availabilityNote.trim() || null,
    })
    .eq("id", input.productId);

  if (error) return { error: error.message };

  if (existing) {
    let summary = `"${name}" updated`;
    if (existing.price !== price) {
      summary = `"${name}" price changed from ${existing.price} to ${price}`;
    } else if (existing.stock_quantity !== stockQuantity) {
      const oldStock = existing.stock_quantity ?? "untracked";
      const newStock = stockQuantity ?? "untracked";
      summary = `"${name}" stock changed from ${oldStock} to ${newStock}`;
    } else if (existing.is_available !== input.isAvailable) {
      summary = `"${name}" marked ${input.isAvailable ? "available" : "unavailable"}`;
    }
    await logActivity(existing.business_id, "product", input.productId, "updated", summary, input.source ?? "admin_ui");

    // Nudges' restock_alert trigger needs the specific 0 -> positive
    // transition, not just "currently has stock" -- this is the one
    // place that transition is actually visible (a single PATCH knows
    // both the before and after value; the products table alone only
    // ever has "now").
    if (existing.stock_quantity === 0 && stockQuantity !== null && stockQuantity > 0) {
      const { error: restockError } = await supabase
        .from("product_restock_events")
        .insert({ business_id: existing.business_id, product_id: input.productId });
      if (restockError) console.error("Failed to record restock event:", restockError);
    }
  }

  return { error: null };
}

export async function deleteProduct(productId: string) {
  const admin = await getCurrentAdmin();
  if (!admin) return { error: "Not authenticated." };

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("products")
    .select("name, business_id")
    .eq("id", productId)
    .maybeSingle();

  const { error } = await supabase.from("products").delete().eq("id", productId);
  if (error) return { error: error.message };

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
  const admin = await getCurrentAdmin();
  if (!admin) return { error: "Not authenticated." };

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
  const admin = await getCurrentAdmin();
  if (!admin) return { error: "Not authenticated." };

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
