"use server";

import { getCurrentBusinessOwner } from "@/lib/supabase/portal-auth";
import { createClient } from "@/lib/supabase/server";
import { buildBusinessContext } from "@/lib/ai/buildContext";
import { parseCommand, INVENTORY_COMMAND_NAMES } from "@/lib/ai/parseCommand";
import { applyProductUpdate, applyProductCreate } from "@/lib/products";
import { getAgentSettings } from "@/lib/agentSettings";

export type CommandResult =
  | { kind: "confirm"; action: string; summary: string; payload: Record<string, unknown> }
  | { kind: "choose"; action: string; options: { label: string; summary: string; payload: Record<string, unknown> }[] }
  | { kind: "info"; message: string }
  | { kind: "error"; message: string };

type ProductRow = { id: string; name: string; price: number; is_available: boolean; stock_quantity: number | null };

// Same "0 matches -> never guess, 1 -> confirm, 2+ -> the owner picks"
// rule as the admin Command Center's findMatches -- see the comment
// there for why an exact match doesn't automatically win.
function findMatches(items: ProductRow[], term: string): ProductRow[] {
  const t = term.trim().toLowerCase();
  if (!t) return [];
  return items.filter(
    (p) => p.name.toLowerCase() === t || p.name.toLowerCase().includes(t) || t.includes(p.name.toLowerCase())
  );
}

async function requireOwner(businessId: string) {
  const owner = await getCurrentBusinessOwner();
  const membership = owner?.businesses.find((b) => b.id === businessId);
  if (!owner || !membership) return { owner: null, settings: null };
  if (membership.role !== "owner") return { owner: null, settings: null };

  // The page-level check in page.tsx is just UX (showing the right
  // message instead of a working-looking form) -- this is the actual
  // boundary. A business owner disabling the assistant in another tab
  // shouldn't leave an already-loaded page still able to write.
  const settings = await getAgentSettings(businessId);
  if (!settings.enabled) return { owner: null, settings: null };

  return { owner, settings };
}

export async function interpretInventoryCommand(businessId: string, instruction: string): Promise<CommandResult> {
  const { owner, settings } = await requireOwner(businessId);
  if (!owner || !settings) {
    return { kind: "error", message: "Only the business owner can use this, and it must be turned on in Settings." };
  }

  if (!instruction.trim()) return { kind: "error", message: "Say what you'd like to change." };

  const context = await buildBusinessContext(businessId);

  let parsed;
  try {
    parsed = await parseCommand(instruction, context, INVENTORY_COMMAND_NAMES, settings.provider);
  } catch (err) {
    return { kind: "error", message: err instanceof Error ? err.message : "Couldn't reach the AI." };
  }

  if (parsed.kind === "text") {
    return { kind: "info", message: parsed.text };
  }

  const supabase = await createClient();
  const { data: products } = await supabase
    .from("products")
    .select("id, name, price, is_available, stock_quantity")
    .eq("business_id", businessId);
  const items = (products ?? []) as ProductRow[];

  switch (parsed.name) {
    case "mark_service_availability": {
      const itemName = String(parsed.args.item_name ?? "");
      const available = Boolean(parsed.args.available);
      const matches = findMatches(items, itemName);

      if (matches.length === 0) {
        return { kind: "info", message: `I don't see a product matching "${itemName}".` };
      }
      if (matches.length > 1) {
        return {
          kind: "choose",
          action: "mark_service_availability",
          options: matches.map((m) => ({
            label: m.name,
            summary: `"${m.name}" is currently ${m.is_available ? "available" : "unavailable"} -- mark it ${available ? "available" : "unavailable"}?`,
            payload: { productId: m.id, available },
          })),
        };
      }
      const match = matches[0];
      return {
        kind: "confirm",
        action: "mark_service_availability",
        summary: `"${match.name}" is currently ${match.is_available ? "available" : "unavailable"} -- mark it ${available ? "available" : "unavailable"}?`,
        payload: { productId: match.id, available },
      };
    }

    case "update_service_price": {
      const itemName = String(parsed.args.item_name ?? "");
      const newPrice = Number(parsed.args.new_price);
      if (Number.isNaN(newPrice)) {
        return { kind: "info", message: "I couldn't tell what the new price should be." };
      }
      const matches = findMatches(items, itemName);

      if (matches.length === 0) {
        return { kind: "info", message: `I don't see a product matching "${itemName}".` };
      }
      if (matches.length > 1) {
        return {
          kind: "choose",
          action: "update_service_price",
          options: matches.map((m) => ({
            label: m.name,
            summary: `"${m.name}" is currently ${m.price} -- change it to ${newPrice}?`,
            payload: { productId: m.id, newPrice },
          })),
        };
      }
      const match = matches[0];
      return {
        kind: "confirm",
        action: "update_service_price",
        summary: `"${match.name}" is currently ${match.price} -- change it to ${newPrice}?`,
        payload: { productId: match.id, newPrice },
      };
    }

    case "update_product_stock": {
      const productName = String(parsed.args.product_name ?? "");
      const newStock = Number(parsed.args.new_stock_quantity);
      if (Number.isNaN(newStock) || newStock < 0) {
        return { kind: "info", message: "I couldn't tell what the new stock count should be." };
      }
      const matches = findMatches(items, productName);

      if (matches.length === 0) {
        return { kind: "info", message: `I don't see a product matching "${productName}".` };
      }
      if (matches.length > 1) {
        return {
          kind: "choose",
          action: "update_product_stock",
          options: matches.map((m) => ({
            label: m.name,
            summary: `"${m.name}" stock is currently ${m.stock_quantity ?? "untracked"} -- set it to ${newStock}?`,
            payload: { productId: m.id, newStock },
          })),
        };
      }
      const match = matches[0];
      return {
        kind: "confirm",
        action: "update_product_stock",
        summary: `"${match.name}" stock is currently ${match.stock_quantity ?? "untracked"} -- set it to ${newStock}?`,
        payload: { productId: match.id, newStock },
      };
    }

    case "create_product": {
      const name = String(parsed.args.name ?? "").trim();
      const price = Number(parsed.args.price);
      if (!name || Number.isNaN(price) || price < 0) {
        return { kind: "info", message: "I need a name and a valid price for the new product." };
      }
      const description = parsed.args.description ? String(parsed.args.description).trim() : "";
      const stockQuantity = parsed.args.stock_quantity !== undefined ? Number(parsed.args.stock_quantity) : null;
      if (stockQuantity !== null && (Number.isNaN(stockQuantity) || stockQuantity < 0)) {
        return { kind: "info", message: "I couldn't tell what the starting stock count should be." };
      }
      return {
        kind: "confirm",
        action: "create_product",
        summary: `Add a new product "${name}" at ${price}${stockQuantity !== null ? `, starting stock ${stockQuantity}` : ""}?`,
        payload: { name, description, price, stockQuantity },
      };
    }

    default:
      return { kind: "info", message: "I can only help with product availability, price, stock, and adding new products here." };
  }
}

// Executes a confirmed action via the SAME core (applyProductUpdate)
// the admin product form and Command Center use -- not a third write
// path, so the restock-event tracking Nudges depends on works
// identically regardless of who triggered the change.
export async function executeInventoryCommand(
  businessId: string,
  action: string,
  payload: Record<string, unknown>
): Promise<{ error: string | null }> {
  const { owner } = await requireOwner(businessId);
  if (!owner) return { error: "Only the business owner can use this, and it must be turned on in Settings." };

  if (
    !["mark_service_availability", "update_service_price", "update_product_stock", "create_product"].includes(action)
  ) {
    return { error: "Unknown action." };
  }

  if (action === "create_product") {
    const result = await applyProductCreate({
      businessId,
      name: String(payload.name),
      description: payload.description ? String(payload.description) : "",
      price: String(payload.price),
      stockQuantity:
        payload.stockQuantity !== null && payload.stockQuantity !== undefined ? String(payload.stockQuantity) : "",
      isAvailable: true,
      availabilityNote: "",
      source: "portal_command",
      actorLabel: owner.email,
    });
    return { error: result.error };
  }

  const productId = String(payload.productId);
  const supabase = await createClient();
  const { data: full } = await supabase
    .from("products")
    .select("name, description, price, stock_quantity, is_available, availability_note")
    .eq("id", productId)
    .eq("business_id", businessId)
    .maybeSingle();

  if (!full) return { error: "That product no longer exists." };

  return applyProductUpdate({
    productId,
    name: full.name,
    description: full.description ?? "",
    price: action === "update_service_price" ? String(payload.newPrice) : String(full.price),
    stockQuantity:
      action === "update_product_stock" ? String(payload.newStock) : full.stock_quantity != null ? String(full.stock_quantity) : "",
    isAvailable: action === "mark_service_availability" ? Boolean(payload.available) : full.is_available,
    availabilityNote: full.availability_note ?? "",
    source: "portal_command",
    actorLabel: owner.email,
  });
}
