"use server";

import { getCurrentAdmin } from "@/lib/supabase/admin-auth";
import { provisionBusinessTrial } from "@/lib/billing";
import { createClient } from "@/lib/supabase/server";

export async function createBusiness(input: {
  name: string;
  slug: string;
  currency: string;
}) {
  const admin = await getCurrentAdmin();
  if (!admin) return { error: "Not authenticated." };

  const name = input.name.trim();
  const slug = input.slug.trim().toLowerCase();
  if (!name || !slug) return { error: "Name and slug are required." };
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return { error: "Slug can only contain lowercase letters, numbers, and hyphens." };
  }

  const supabase = await createClient();
  const { data: business, error } = await supabase
    .from("businesses")
    .insert({ name, slug, currency: input.currency.trim() || "NGN" })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return { error: "That slug is already taken." };
    return { error: error.message };
  }

  const { error: trialError } = await provisionBusinessTrial(supabase, business.id, admin.id);
  if (trialError) {
    await supabase.from("businesses").delete().eq("id", business.id);
    if (trialError.message.includes("TRIAL_ALREADY_USED")) {
      return { error: "Your 14-day trial has already been used." };
    }
    return { error: trialError.message };
  }

  return { error: null };
}
