import { createClient } from "@/lib/supabase/server";
import { parseBrandColor } from "@/lib/brandColor";

// Best effort: a missing column (migration 0064 not applied yet) or any read error
// just means "no custom colour", so the Settings page still loads.
export async function getBrandColor(businessId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("businesses").select("brand_color").eq("id", businessId).maybeSingle();
  return parseBrandColor(data?.brand_color);
}

// Owners can read their business row but have no UPDATE permission on it, so a plain
// .update() would be silently ignored by RLS. update_business_brand_color (migration
// 0064) checks the caller is the owner or a platform admin and touches only brand_color.
// Pass null to go back to Mira's default colour.
export async function updateBrandColor(businessId: string, color: string | null): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_business_brand_color", {
    p_business_id: businessId,
    p_color: color,
  });
  if (error) {
    // Most likely cause right after deploying: the migration hasn't been run yet.
    if (/does not exist|could not find the function/i.test(error.message)) {
      return { error: "Brand colours aren't switched on for your account yet. Please try again later." };
    }
    return { error: error.message };
  }
  return { error: null };
}
