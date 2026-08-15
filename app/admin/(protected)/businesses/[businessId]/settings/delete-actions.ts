"use server";

import { getCurrentAdmin } from "@/lib/supabase/admin-auth";
import { createClient } from "@/lib/supabase/server";

// Every business-scoped table cascades from businesses (on delete
// cascade) -- conversations, messages, orders, products, nudge_rules,
// business_owners, all of it. That's exactly why this checks the typed
// name server-side too rather than trusting a disabled-button client
// check alone: the button being enabled isn't the security boundary,
// this comparison is.
export async function deleteBusiness(businessId: string, confirmedName: string): Promise<{ error: string | null }> {
  const admin = await getCurrentAdmin();
  if (!admin) return { error: "Not authenticated." };

  const supabase = await createClient();
  const { data: business } = await supabase
    .from("businesses")
    .select("name")
    .eq("id", businessId)
    .maybeSingle();

  if (!business) return { error: "Business not found." };
  if (confirmedName.trim() !== business.name) {
    return { error: "That doesn't match the business name -- nothing was deleted." };
  }

  const { error } = await supabase.from("businesses").delete().eq("id", businessId);
  if (error) return { error: error.message };

  return { error: null };
}
