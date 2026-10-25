"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAdmin } from "@/lib/supabase/admin-auth";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activityLog";

// Switching a business to "school" turns on the School page in its portal and the school
// calendar / guardian fee lookup in the AI. It doesn't delete anything when switched back:
// school data is kept and simply stops being used.
export async function setBusinessType(input: { businessId: string; businessType: "general" | "school" }) {
  const admin = await getCurrentAdmin();
  if (!admin) return { error: "Not authenticated." };
  if (input.businessType !== "general" && input.businessType !== "school") return { error: "Unknown business type." };

  const supabase = await createClient();
  const { error } = await supabase.from("businesses").update({ business_type: input.businessType }).eq("id", input.businessId);
  if (error) return { error: error.message };

  await logActivity(input.businessId, "business", input.businessId, "updated", `Business type set to ${input.businessType}`);
  revalidatePath(`/admin/businesses/${input.businessId}/settings`);
  return { error: null };
}
