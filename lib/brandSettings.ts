import { createClient } from "@/lib/supabase/server";
import { parseBrandColor } from "@/lib/brandColor";

export type ChatColors = { brandColor: string | null; backgroundColor: string | null };

// Best effort, one query per column: a column that doesn't exist yet (migration 0064 or
// 0067 not applied) or any read error just means "no custom colour" for that one, so the
// Settings page still loads.
export async function getChatColors(businessId: string): Promise<ChatColors> {
  const supabase = await createClient();
  const [{ data: brand }, { data: background }] = await Promise.all([
    supabase.from("businesses").select("brand_color").eq("id", businessId).maybeSingle(),
    supabase.from("businesses").select("background_color").eq("id", businessId).maybeSingle(),
  ]);
  return { brandColor: parseBrandColor(brand?.brand_color), backgroundColor: parseBrandColor(background?.background_color) };
}

// Owners can read their business row but have no UPDATE permission on it, so a plain
// .update() would be silently ignored by RLS. update_business_chat_colors (migration 0067)
// checks the caller is the owner or a platform admin and touches only the two colour
// columns. Pass null for either to go back to Mira's default for it.
export async function updateChatColors(businessId: string, colors: ChatColors): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_business_chat_colors", {
    p_business_id: businessId,
    p_brand: colors.brandColor,
    p_background: colors.backgroundColor,
  });
  if (error) {
    // Most likely cause right after deploying: the migration hasn't been run yet.
    if (/does not exist|could not find the function/i.test(error.message)) {
      return { error: "Chat colours aren't switched on for your account yet. Please try again later." };
    }
    return { error: error.message };
  }
  return { error: null };
}
