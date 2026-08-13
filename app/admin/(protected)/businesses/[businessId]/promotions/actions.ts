"use server";

import { getCurrentAdmin } from "@/lib/supabase/admin-auth";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activityLog";
import { startOfDayUTC, endOfDayUTC } from "@/lib/timezone";

export async function createPromotion(input: {
  businessId: string;
  description: string;
  serviceId: string;
  startsAt: string;
  endsAt: string;
  source?: "admin_ui" | "command_center";
}) {
  const admin = await getCurrentAdmin();
  if (!admin) return { error: "Not authenticated." };

  const description = input.description.trim();
  if (!description) return { error: "Description is required." };

  const supabase = await createClient();

  // The date inputs are plain "YYYY-MM-DD" with no timezone -- without
  // this, Postgres stores them as UTC midnight, which makes a promotion
  // "ending Friday" actually expire around 1am Friday in Africa/Lagos.
  // Falls back to Africa/Lagos (Mira's default) if the lookup fails.
  const { data: biz } = await supabase
    .from("businesses")
    .select("timezone")
    .eq("id", input.businessId)
    .maybeSingle();
  const timeZone = biz?.timezone ?? "Africa/Lagos";

  const { data: created, error } = await supabase
    .from("promotions")
    .insert({
      business_id: input.businessId,
      service_id: input.serviceId || null,
      description,
      starts_at: input.startsAt ? startOfDayUTC(input.startsAt, timeZone) : null,
      ends_at: input.endsAt ? endOfDayUTC(input.endsAt, timeZone) : null,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  await logActivity(input.businessId, "promotion", created?.id ?? null, "created", `Promotion created: "${description}"`, input.source ?? "admin_ui");
  return { error: null, promotionId: created?.id };
}

export async function updatePromotion(input: {
  promotionId: string;
  description: string;
  serviceId: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
}) {
  const admin = await getCurrentAdmin();
  if (!admin) return { error: "Not authenticated." };

  const description = input.description.trim();
  if (!description) return { error: "Description is required." };

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("promotions")
    .select("business_id")
    .eq("id", input.promotionId)
    .maybeSingle();

  let timeZone = "Africa/Lagos";
  if (existing) {
    const { data: biz } = await supabase
      .from("businesses")
      .select("timezone")
      .eq("id", existing.business_id)
      .maybeSingle();
    timeZone = biz?.timezone ?? timeZone;
  }

  const { error } = await supabase
    .from("promotions")
    .update({
      description,
      service_id: input.serviceId || null,
      starts_at: input.startsAt ? startOfDayUTC(input.startsAt, timeZone) : null,
      ends_at: input.endsAt ? endOfDayUTC(input.endsAt, timeZone) : null,
      is_active: input.isActive,
    })
    .eq("id", input.promotionId);

  if (error) return { error: error.message };

  if (existing) {
    await logActivity(existing.business_id, "promotion", input.promotionId, "updated", `Promotion updated: "${description}"`);
  }
  return { error: null };
}

export async function deletePromotion(promotionId: string) {
  const admin = await getCurrentAdmin();
  if (!admin) return { error: "Not authenticated." };

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("promotions")
    .select("description, business_id")
    .eq("id", promotionId)
    .maybeSingle();

  const { error } = await supabase.from("promotions").delete().eq("id", promotionId);
  if (error) return { error: error.message };

  if (existing) {
    await logActivity(existing.business_id, "promotion", promotionId, "deleted", `Promotion removed: "${existing.description}"`);
  }
  return { error: null };
}
