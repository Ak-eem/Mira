import type { SupabaseClient } from "@supabase/supabase-js";
import type { BusinessType } from "@/lib/businessTypes";

// Records what kind of business a new signup chose. Best effort on purpose: the business already exists and works as a
// general business, so a failure here must never block signup. The owner (or Mira staff) can change it later in settings.
export async function applyBusinessType(supabase: SupabaseClient, businessId: unknown, type: BusinessType): Promise<void> {
  if (type === "general" || typeof businessId !== "string") return;
  const { error } = await supabase.rpc("set_business_type", { p_business_id: businessId, p_type: type });
  if (error) console.error("set_business_type failed:", error.message);
}
