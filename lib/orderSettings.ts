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

export async function updateOrderTakingEnabled(
  businessId: string,
  enabled: boolean,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.from("businesses").update({ ai_order_taking: enabled }).eq("id", businessId);
  return { error: error?.message ?? null };
}
