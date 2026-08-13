"use server";

import { getCurrentAdmin } from "@/lib/supabase/admin-auth";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activityLog";

export async function createService(input: {
  businessId: string;
  name: string;
  description: string;
  price: string;
  isAvailable: boolean;
  availabilityNote: string;
}) {
  const admin = await getCurrentAdmin();
  if (!admin) return { error: "Not authenticated." };

  const name = input.name.trim();
  if (!name) return { error: "Name is required." };

  const price = input.price.trim() === "" ? null : Number(input.price);
  if (price !== null && Number.isNaN(price)) return { error: "Price must be a number." };

  const supabase = await createClient();
  const { data: created, error } = await supabase
    .from("services")
    .insert({
      business_id: input.businessId,
      name,
      description: input.description.trim() || null,
      price,
      is_available: input.isAvailable,
      availability_note: input.availabilityNote.trim() || null,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  await logActivity(input.businessId, "service", created?.id ?? null, "created", `"${name}" added`);
  return { error: null };
}

export async function updateService(input: {
  serviceId: string;
  name: string;
  description: string;
  price: string;
  isAvailable: boolean;
  availabilityNote: string;
  source?: "admin_ui" | "command_center";
}) {
  const admin = await getCurrentAdmin();
  if (!admin) return { error: "Not authenticated." };

  const name = input.name.trim();
  if (!name) return { error: "Name is required." };

  const price = input.price.trim() === "" ? null : Number(input.price);
  if (price !== null && Number.isNaN(price)) return { error: "Price must be a number." };

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("services")
    .select("name, price, is_available, business_id")
    .eq("id", input.serviceId)
    .maybeSingle();

  const { error } = await supabase
    .from("services")
    .update({
      name,
      description: input.description.trim() || null,
      price,
      is_available: input.isAvailable,
      availability_note: input.availabilityNote.trim() || null,
    })
    .eq("id", input.serviceId);

  if (error) return { error: error.message };

  if (existing) {
    let summary = `"${name}" updated`;
    if (existing.price !== price) {
      const oldPrice = existing.price != null ? existing.price : "no price";
      const newPrice = price != null ? price : "no price";
      summary = `"${name}" price changed from ${oldPrice} to ${newPrice}`;
    } else if (existing.is_available !== input.isAvailable) {
      summary = `"${name}" marked ${input.isAvailable ? "available" : "unavailable"}`;
    }
    await logActivity(existing.business_id, "service", input.serviceId, "updated", summary, input.source ?? "admin_ui");
  }

  return { error: null };
}

export async function deleteService(serviceId: string) {
  const admin = await getCurrentAdmin();
  if (!admin) return { error: "Not authenticated." };

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("services")
    .select("name, business_id")
    .eq("id", serviceId)
    .maybeSingle();

  const { error } = await supabase.from("services").delete().eq("id", serviceId);
  if (error) return { error: error.message };

  if (existing) {
    await logActivity(existing.business_id, "service", serviceId, "deleted", `"${existing.name}" removed`);
  }

  return { error: null };
}
