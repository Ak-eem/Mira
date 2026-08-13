"use server";

import { getCurrentAdmin } from "@/lib/supabase/admin-auth";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activityLog";
import { isValidTimeZone } from "@/lib/timezone";

export async function updateBusiness(input: {
  businessId: string;
  name: string;
  slug: string;
  description: string;
  currency: string;
  timezone: string;
  aiTone: string;
  aiInstructions: string;
  hoursNote: string;
  whatsappPhoneNumberId: string;
  isActive: boolean;
}) {
  const admin = await getCurrentAdmin();
  if (!admin) return { error: "Not authenticated." };

  const name = input.name.trim();
  const slug = input.slug.trim().toLowerCase();
  if (!name || !slug) return { error: "Name and slug are required." };
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return { error: "Slug can only contain lowercase letters, numbers, and hyphens." };
  }

  const timezone = input.timezone.trim() || "Africa/Lagos";
  if (!isValidTimeZone(timezone)) {
    // A typo'd timezone doesn't error anywhere obvious -- it just makes
    // isOpenNow() (and now the promotion/closure date conversions) fail
    // silently for this business from here on. Reject it up front instead.
    return { error: `"${timezone}" isn't a recognized timezone (e.g. "Africa/Lagos", "Europe/London").` };
  }

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("businesses")
    .select("is_active")
    .eq("id", input.businessId)
    .maybeSingle();

  const { error } = await supabase
    .from("businesses")
    .update({
      name,
      slug,
      description: input.description.trim() || null,
      currency: input.currency.trim() || "NGN",
      timezone,
      ai_tone: input.aiTone.trim() || null,
      ai_instructions: input.aiInstructions.trim() || null,
      hours_note: input.hoursNote.trim() || null,
      whatsapp_phone_number_id: input.whatsappPhoneNumberId.trim() || null,
      is_active: input.isActive,
    })
    .eq("id", input.businessId);

  if (error) {
    if (error.code === "23505") {
      if (error.message.includes("whatsapp_phone_number_id")) {
        return { error: "That WhatsApp phone number ID is already connected to another business." };
      }
      return { error: "That slug is already taken." };
    }
    return { error: error.message };
  }

  // Pausing/resuming is a meaningfully different kind of event than a
  // routine settings edit -- worth calling out specifically rather
  // than folding into a generic "settings updated" line.
  const summary =
    existing && existing.is_active !== input.isActive
      ? `Business ${input.isActive ? "resumed" : "paused"}`
      : "Business settings updated";

  await logActivity(input.businessId, "business", input.businessId, "updated", summary);
  return { error: null };
}
