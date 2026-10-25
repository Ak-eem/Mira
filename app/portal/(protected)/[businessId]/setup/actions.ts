"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { normalizeAnswers } from "@/lib/onboarding";

// Saves the setup wizard's answers (or a skip: every answer null) and marks
// onboarding done so the dashboard stops redirecting here.
//
// Runs as the signed-in user, not the service role. Who may do this is
// decided in the database: complete_onboarding checks the caller is the
// business OWNER (or a platform admin) and can write only these four
// columns, so a crafted call can't edit anything else or another business.
export async function completeOnboarding(businessId: string, answers: unknown): Promise<{ error: string | null }> {
  const parsed = normalizeAnswers(answers);
  if (!parsed.ok) return { error: parsed.error };

  const supabase = await createClient();
  const { error } = await supabase.rpc("complete_onboarding", {
    p_business_id: businessId,
    p_wants_email_channel: parsed.answers.wantsEmailChannel,
    p_tracks_inventory: parsed.answers.tracksInventory,
    p_logistics_provider: parsed.answers.logisticsProvider,
  });
  if (error) {
    if (error.code === "42501") return { error: "Only the business owner can do this." };
    console.error("completeOnboarding failed", error);
    return { error: "Couldn't save your answers. Please try again." };
  }

  revalidatePath(`/portal/${businessId}`);
  return { error: null };
}
