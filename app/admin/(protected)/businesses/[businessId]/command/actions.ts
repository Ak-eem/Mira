"use server";

import { getCurrentAdmin } from "@/lib/supabase/admin-auth";
import { createClient } from "@/lib/supabase/server";
import { buildBusinessContext } from "@/lib/ai/buildContext";
import { parseCommand } from "@/lib/ai/parseCommand";
import { logActivity } from "@/lib/activityLog";
import { updateService } from "../services/actions";
import { updateProduct } from "../products/actions";
import { createPromotion } from "../promotions/actions";
import { createFaq } from "../faqs/actions";

export type CommandResult =
  | { kind: "confirm"; action: string; summary: string; payload: Record<string, unknown> }
  | { kind: "choose"; action: string; options: { label: string; summary: string; payload: Record<string, unknown> }[] }
  | { kind: "info"; message: string }
  | { kind: "error"; message: string };

type ServiceRow = { id: string; name: string; price: number | null; is_available: boolean };
type ProductRow = { id: string; name: string; price: number; is_available: boolean; stock_quantity: number | null };
// "kind" is carried alongside a service/product row once matched, so
// executeCommand knows which table (and which admin action) a matched
// id actually belongs to -- a service and a product can validly share
// a name, so the id alone isn't enough to know which one this is.
type ItemRow = (ServiceRow | ProductRow) & { kind: "service" | "product" };

// Matches a free-text name against a list of real rows (services,
// products, or both combined -- anything with a name). Returns 0 items
// (no match -- never guess), 1 item (confident enough to confirm), or
// 2+ items (genuinely ambiguous -- the admin picks, this never
// silently picks for them).
//
// Deliberately does NOT special-case an exact match as automatically
// unambiguous: "shoes" exactly matching something literally named
// "Shoes" doesn't mean "Kids Shoes" stops being a plausible other
// reading. An exact match only wins outright when nothing else in the
// business's data also overlaps with the term.
function findMatches<T extends { name: string }>(items: T[], term: string): T[] {
  const t = term.trim().toLowerCase();
  if (!t) return [];
  return items.filter(
    (s) => s.name.toLowerCase() === t || s.name.toLowerCase().includes(t) || t.includes(s.name.toLowerCase())
  );
}

// Services and products are separate tables, but from an admin typing a
// plain instruction they're both just "things this business sells" --
// "mark the Ankara bag unavailable" shouldn't need the admin to know or
// care which table it lives in. Searched together so a name that exists
// as both a service and a product surfaces as a genuine ambiguous choice,
// same as two same-named services would, rather than one silently
// shadowing the other.
async function fetchItems(supabase: Awaited<ReturnType<typeof createClient>>, businessId: string): Promise<ItemRow[]> {
  const [{ data: services }, { data: products }] = await Promise.all([
    supabase.from("services").select("id, name, price, is_available").eq("business_id", businessId),
    supabase.from("products").select("id, name, price, is_available, stock_quantity").eq("business_id", businessId),
  ]);

  return [
    ...((services ?? []) as ServiceRow[]).map((s): ItemRow => ({ ...s, kind: "service" })),
    ...((products ?? []) as ProductRow[]).map((p): ItemRow => ({ ...p, kind: "product" })),
  ];
}

export async function interpretCommand(businessId: string, instruction: string): Promise<CommandResult> {
  const admin = await getCurrentAdmin();
  if (!admin) return { kind: "error", message: "Not authenticated." };

  if (!instruction.trim()) return { kind: "error", message: "Say what you'd like to change." };

  const context = await buildBusinessContext(businessId);

  let parsed;
  try {
    parsed = await parseCommand(instruction, context);
  } catch (err) {
    return { kind: "error", message: err instanceof Error ? err.message : "Couldn't reach the AI." };
  }

  if (parsed.kind === "text") {
    return { kind: "info", message: parsed.text };
  }

  const supabase = await createClient();

  switch (parsed.name) {
    case "mark_service_availability": {
      const itemName = String(parsed.args.item_name ?? "");
      const available = Boolean(parsed.args.available);

      const items = await fetchItems(supabase, businessId);
      const matches = findMatches(items, itemName);

      if (matches.length === 0) {
        return { kind: "info", message: `I don't see anything matching "${itemName}" among your services or products.` };
      }
      if (matches.length > 1) {
        return {
          kind: "choose",
          action: "mark_service_availability",
          options: matches.map((m) => ({
            label: `${m.name} (${m.kind})`,
            summary: `"${m.name}" is currently ${m.is_available ? "available" : "unavailable"} -- mark it ${available ? "available" : "unavailable"}?`,
            payload: { itemId: m.id, kind: m.kind, available },
          })),
        };
      }
      const match = matches[0];
      return {
        kind: "confirm",
        action: "mark_service_availability",
        summary: `"${match.name}" is currently ${match.is_available ? "available" : "unavailable"} -- mark it ${available ? "available" : "unavailable"}?`,
        payload: { itemId: match.id, kind: match.kind, available },
      };
    }

    case "update_service_price": {
      const itemName = String(parsed.args.item_name ?? "");
      const newPrice = Number(parsed.args.new_price);
      if (Number.isNaN(newPrice)) {
        return { kind: "info", message: "I couldn't tell what the new price should be." };
      }

      const items = await fetchItems(supabase, businessId);
      const matches = findMatches(items, itemName);

      if (matches.length === 0) {
        return { kind: "info", message: `I don't see anything matching "${itemName}" among your services or products.` };
      }
      if (matches.length > 1) {
        return {
          kind: "choose",
          action: "update_service_price",
          options: matches.map((m) => ({
            label: `${m.name} (${m.kind})`,
            summary: `"${m.name}" is currently ${m.price ?? "no price set"} -- change it to ${newPrice}?`,
            payload: { itemId: m.id, kind: m.kind, newPrice },
          })),
        };
      }
      const match = matches[0];
      return {
        kind: "confirm",
        action: "update_service_price",
        summary: `"${match.name}" is currently ${match.price ?? "no price set"} -- change it to ${newPrice}?`,
        payload: { itemId: match.id, kind: match.kind, newPrice },
      };
    }

    case "update_product_stock": {
      const productName = String(parsed.args.product_name ?? "");
      const newStock = Number(parsed.args.new_stock_quantity);
      if (Number.isNaN(newStock) || newStock < 0) {
        return { kind: "info", message: "I couldn't tell what the new stock count should be." };
      }

      const { data: products } = await supabase
        .from("products")
        .select("id, name, price, is_available, stock_quantity")
        .eq("business_id", businessId);
      const matches = findMatches((products ?? []) as ProductRow[], productName);

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

    case "create_promotion": {
      const description = String(parsed.args.description ?? "").trim();
      if (!description) return { kind: "info", message: "I couldn't tell what the promotion should say." };

      const serviceName = parsed.args.service_name ? String(parsed.args.service_name) : "";
      const endsAt = parsed.args.ends_at ? String(parsed.args.ends_at) : "";
      let serviceId: string | null = null;

      if (serviceName) {
        const { data: services } = await supabase
          .from("services")
          .select("id, name, price, is_available")
          .eq("business_id", businessId);
        const matches = findMatches((services ?? []) as ServiceRow[], serviceName);

        if (matches.length > 1) {
          return {
            kind: "choose",
            action: "create_promotion",
            options: matches.map((m) => ({
              label: m.name,
              summary: `Create promotion for "${m.name}": "${description}"${endsAt ? `, ending ${endsAt}` : ""}?`,
              payload: { description, serviceId: m.id, endsAt },
            })),
          };
        }
        if (matches.length === 1) serviceId = matches[0].id;
        // zero matches: falls through as business-wide rather than
        // blocking on a service name that didn't resolve to anything
      }

      return {
        kind: "confirm",
        action: "create_promotion",
        summary: `Create promotion: "${description}"${serviceId ? "" : " (applies to all services)"}${endsAt ? `, ending ${endsAt}` : ""}?`,
        payload: { description, serviceId, endsAt },
      };
    }

    case "update_hours": {
      const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
      const dayInput = String(parsed.args.day ?? "").toLowerCase().trim();

      // Exact match first. Only fall back to a prefix match ("tue" ->
      // "tuesday") when exactly one day qualifies -- same "don't silently
      // pick" rule findMatches applies to services, so a fuzzy day like
      // "s" doesn't quietly resolve to Sunday over Saturday.
      const exactDay = dayNames.indexOf(dayInput);
      const prefixDays = dayNames.filter((d) => d.startsWith(dayInput));
      const dayIndex = exactDay !== -1 ? exactDay : prefixDays.length === 1 ? dayNames.indexOf(prefixDays[0]) : -1;

      if (dayIndex === -1) {
        return { kind: "info", message: `I couldn't tell which day you meant by "${parsed.args.day}".` };
      }

      const closed = Boolean(parsed.args.closed);
      const opensAt = String(parsed.args.opens_at ?? "");
      const closesAt = String(parsed.args.closes_at ?? "");

      if (!closed && (!opensAt || !closesAt)) {
        return { kind: "info", message: "I need both an opening and closing time, or that the day is closed." };
      }

      const dayLabel = dayNames[dayIndex][0].toUpperCase() + dayNames[dayIndex].slice(1);
      return {
        kind: "confirm",
        action: "update_hours",
        summary: closed ? `Mark ${dayLabel} as closed?` : `Set ${dayLabel} hours to ${opensAt}-${closesAt}?`,
        payload: { dayOfWeek: dayIndex, dayLabel, closed, opensAt, closesAt },
      };
    }

    case "add_faq": {
      const question = String(parsed.args.question ?? "").trim();
      const answer = String(parsed.args.answer ?? "").trim();
      if (!question || !answer) {
        return { kind: "info", message: "I need both a question and an answer to add an FAQ." };
      }
      return {
        kind: "confirm",
        action: "add_faq",
        summary: `Add FAQ -- Q: "${question}" A: "${answer}"?`,
        payload: { question, answer },
      };
    }

    default:
      return { kind: "info", message: "I'm not sure how to help with that yet." };
  }
}

// Executes a confirmed action by calling the SAME functions the admin
// forms use -- not a second write path. Only update_hours is a direct
// upsert rather than reusing saveHours, since saveHours operates on all
// seven days at once and doesn't fit a single-day change naturally; that
// one case still logs explicitly below, since there's no wrapped
// function call doing it for it.
export async function executeCommand(
  businessId: string,
  action: string,
  payload: Record<string, unknown>
): Promise<{ error: string | null }> {
  const admin = await getCurrentAdmin();
  if (!admin) return { error: "Not authenticated." };

  switch (action) {
    case "mark_service_availability":
    case "update_service_price": {
      const itemId = String(payload.itemId);
      const kind = payload.kind === "product" ? "product" : "service";
      const supabase = await createClient();

      if (kind === "product") {
        const { data: full } = await supabase
          .from("products")
          .select("name, description, price, stock_quantity, is_available, availability_note")
          .eq("id", itemId)
          .maybeSingle();

        if (!full) return { error: "That product no longer exists." };

        return await updateProduct({
          productId: itemId,
          name: full.name,
          description: full.description ?? "",
          price: action === "update_service_price" ? String(payload.newPrice) : String(full.price),
          stockQuantity: full.stock_quantity != null ? String(full.stock_quantity) : "",
          isAvailable: action === "mark_service_availability" ? Boolean(payload.available) : full.is_available,
          availabilityNote: full.availability_note ?? "",
          source: "command_center",
        });
      }

      const { data: full } = await supabase
        .from("services")
        .select("name, description, price, is_available, availability_note")
        .eq("id", itemId)
        .maybeSingle();

      if (!full) return { error: "That service no longer exists." };

      return await updateService({
        serviceId: itemId,
        name: full.name,
        description: full.description ?? "",
        price:
          action === "update_service_price"
            ? String(payload.newPrice)
            : full.price != null
              ? String(full.price)
              : "",
        isAvailable: action === "mark_service_availability" ? Boolean(payload.available) : full.is_available,
        availabilityNote: full.availability_note ?? "",
        source: "command_center",
      });
    }

    case "update_product_stock": {
      const productId = String(payload.productId);
      const supabase = await createClient();
      const { data: full } = await supabase
        .from("products")
        .select("name, description, price, is_available, availability_note")
        .eq("id", productId)
        .maybeSingle();

      if (!full) return { error: "That product no longer exists." };

      return await updateProduct({
        productId,
        name: full.name,
        description: full.description ?? "",
        price: String(full.price),
        stockQuantity: String(payload.newStock),
        isAvailable: full.is_available,
        availabilityNote: full.availability_note ?? "",
        source: "command_center",
      });
    }

    case "create_promotion": {
      const result = await createPromotion({
        businessId,
        description: String(payload.description),
        serviceId: payload.serviceId ? String(payload.serviceId) : "",
        startsAt: "",
        endsAt: payload.endsAt ? String(payload.endsAt) : "",
        source: "command_center",
      });
      return { error: result.error };
    }

    case "update_hours": {
      const supabase = await createClient();
      const { error } = await supabase.from("business_hours").upsert(
        {
          business_id: businessId,
          day_of_week: Number(payload.dayOfWeek),
          opens_at: payload.closed ? null : String(payload.opensAt),
          closes_at: payload.closed ? null : String(payload.closesAt),
        },
        { onConflict: "business_id,day_of_week" }
      );
      if (error) return { error: error.message };

      await logActivity(
        businessId,
        "hours",
        null,
        "updated",
        payload.closed ? `${payload.dayLabel} marked closed` : `${payload.dayLabel} hours updated`,
        "command_center"
      );
      return { error: null };
    }

    case "add_faq": {
      const result = await createFaq({
        businessId,
        question: String(payload.question),
        answer: String(payload.answer),
        source: "command_center",
      });
      return { error: result.error };
    }

    default:
      return { error: "Unknown action." };
  }
}
