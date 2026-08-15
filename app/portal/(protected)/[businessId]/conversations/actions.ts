"use server";

import { revalidatePath } from "next/cache";
import { getCurrentBusinessOwner } from "@/lib/supabase/portal-auth";
import { createClient } from "@/lib/supabase/server";

// Mirrors app/admin/.../conversations/actions.ts's resolveHandoff, but
// checked against business-owner membership instead of platform-admin --
// deliberately a separate function rather than a shared one with a role
// param, so the two auth checks can never accidentally get swapped.
export async function resolveHandoff(businessId: string, conversationId: string): Promise<void> {
  const owner = await getCurrentBusinessOwner();
  if (!owner || !owner.businesses.some((b) => b.id === businessId)) {
    console.error("resolveHandoff (portal) called without owning this business");
    return;
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("conversations")
    .update({ needs_human: false })
    .eq("id", conversationId)
    .eq("business_id", businessId);

  if (error) {
    console.error("Failed to resolve handoff flag (portal):", error);
    return;
  }

  revalidatePath(`/portal/${businessId}/conversations/${conversationId}`);
  revalidatePath(`/portal/${businessId}/conversations`);
  revalidatePath(`/portal/${businessId}`);
}
