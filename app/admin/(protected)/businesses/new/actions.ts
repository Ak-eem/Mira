"use server";

import { getCurrentAdmin } from "@/lib/supabase/admin-auth";
import { createClient } from "@/lib/supabase/server";

// Server Actions can in principle be invoked directly, not only via the
// page that renders this form — so we re-check admin status here too,
// rather than trusting that the (protected) layout already gated access.
// The actual authorization backstop is still the is_platform_admin() RLS
// policy on the insert below; this check just gives a clean error message
// instead of a raw Postgres permission error.
export async function createBusiness(input: {
  name: string;
  slug: string;
  currency: string;
}) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return { error: "Not authenticated." };
  }

  const name = input.name.trim();
  const slug = input.slug.trim().toLowerCase();

  if (!name || !slug) {
    return { error: "Name and slug are required." };
  }

  if (!/^[a-z0-9-]+$/.test(slug)) {
    return { error: "Slug can only contain lowercase letters, numbers, and hyphens." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("businesses").insert({
    name,
    slug,
    currency: input.currency.trim() || "NGN",
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "That slug is already taken." };
    }
    return { error: error.message };
  }

  return { error: null };
}
