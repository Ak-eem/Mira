import { createClient } from "@/lib/supabase/server";

export async function getOrderTakingEnabled(businessId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("businesses")
    .select("ai_order_taking")
    .eq("id", businessId)
    .maybeSingle();
  return data?.ai_order_taking === true;
}

// Owners can read their business row but have no UPDATE permission on it, so a
// plain .update() here would be silently ignored by RLS. update_business_settings
// (migration 0054) checks the caller is the business owner or a platform admin
// itself, and only ever touches the specific settings columns.
export async function updateOrderTakingEnabled(
  businessId: string,
  enabled: boolean,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_business_settings", {
    p_business_id: businessId,
    p_ai_order_taking: enabled,
  });
  return { error: error?.message ?? null };
}
