import { createClient } from "@/lib/supabase/server";
import { logActivity, type ActivityAction } from "@/lib/activityLog";

// Same reasoning as applyProductUpdate below: one place that knows how
// to validate and insert a new product, callable by admin's own
// getCurrentAdmin()-gated createProduct and by the portal's
// owner-gated inventory assistant alike.
export async function applyProductCreate(input: {
  businessId: string;
  name: string;
  description: string;
  price: string;
  stockQuantity: string;
  isAvailable: boolean;
  availabilityNote: string;
  source: "admin_ui" | "command_center" | "portal_command";
  actorLabel: string;
}): Promise<{ error: string | null; id: string | null }> {
  const name = input.name.trim();
  if (!name) return { error: "Name is required.", id: null };

  const price = Number(input.price);
  if (input.price.trim() === "" || Number.isNaN(price) || price < 0) {
    return { error: "Price is required and must be a number 0 or greater.", id: null };
  }

  let stockQuantity: number | null = null;
  if (input.stockQuantity.trim() !== "") {
    stockQuantity = Number(input.stockQuantity);
    if (Number.isNaN(stockQuantity) || stockQuantity < 0) {
      return { error: "Stock, if set, must be a whole number 0 or greater.", id: null };
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

  if (error) return { error: error.message, id: null };

  await logActivity(
    input.businessId,
    "product",
    created?.id ?? null,
    "created",
    `${input.actorLabel} added "${name}"`,
    input.source,
  );

  return { error: null, id: created?.id ?? null };
}

// The actual field-update mechanics for a product, with no opinion on
// who's allowed to call it -- that's each caller's job (admin's
// getCurrentAdmin() check, or the portal's owner-membership check).
// Pulled out so there's exactly one place that knows how to validate a
// product update and record a restock event, rather than two copies
// that can quietly drift apart. In particular: the 0 -> positive stock
// transition that feeds Nudges' restock_alert trigger only exists here
// once, so both the admin form and the portal inventory assistant
// trigger it identically.
export async function applyProductUpdate(input: {
  productId: string;
  name: string;
  description: string;
  price: string;
  stockQuantity: string;
  isAvailable: boolean;
  availabilityNote: string;
  source: "admin_ui" | "command_center" | "portal_command";
  actorLabel: string;
}): Promise<{ error: string | null }> {
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
    let summary = `${input.actorLabel} updated "${name}"`;
    if (existing.price !== price) {
      summary = `${input.actorLabel} changed "${name}" price from ${existing.price} to ${price}`;
    } else if (existing.stock_quantity !== stockQuantity) {
      const oldStock = existing.stock_quantity ?? "untracked";
      const newStock = stockQuantity ?? "untracked";
      summary = `${input.actorLabel} changed "${name}" stock from ${oldStock} to ${newStock}`;
    } else if (existing.is_available !== input.isAvailable) {
      summary = `${input.actorLabel} marked "${name}" ${input.isAvailable ? "available" : "unavailable"}`;
    }
    await logActivity(
      existing.business_id,
      "product",
      input.productId,
      "updated" as ActivityAction,
      summary,
      input.source,
    );

    // Nudges' restock_alert trigger needs the specific 0 -> positive
    // transition, not just "currently has stock" -- this is the one
    // place that transition is actually visible (a single write knows
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
