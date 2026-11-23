"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Gives the business its own Mira email address on the receiving domain set up in Resend. The database function decides
// who may do this (the business's owner/admin, or Mira staff); this only supplies the domain and refreshes the pages.
export async function enableEmailAddress(businessId: string): Promise<{ address?: string; error?: string }> {
  const domain = process.env.INBOUND_EMAIL_DOMAIN?.trim();
  if (!domain) return { error: "Email addresses are not switched on yet. Please try again soon." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ensure_inbound_email_address", { p_business_id: businessId, p_domain: domain });
  if (error || typeof data !== "string") {
    console.error("ensure_inbound_email_address failed:", error?.message);
    return { error: "Could not set up the email address. Please try again." };
  }

  revalidatePath(`/portal/${businessId}/settings`);
  revalidatePath(`/admin/businesses/${businessId}/settings`);
  return { address: data };
}
