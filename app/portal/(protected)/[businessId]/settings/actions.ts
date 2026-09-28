"use server";

import { revalidatePath } from "next/cache";
import { getCurrentBusinessOwner } from "@/lib/supabase/portal-auth";
import { saveDraft, publishRelease } from "@/lib/promptReleases";
import { updateAgentSettings } from "@/lib/agentSettings";
import type { ProviderName } from "@/lib/ai/geminiFetch";

// Both actions require the caller to actually be linked to this business
// (any role) -- getCurrentBusinessOwner() is a UX convenience, not the
// security boundary (RLS is), but it's enough to keep someone from
// hitting these actions for a business they have no relationship to at
// all.
async function requireMembership(businessId: string) {
  const owner = await getCurrentBusinessOwner();
  const membership = owner?.businesses.find((b) => b.id === businessId);
  if (!owner || !membership) return { owner: null, role: null as null };
  return { owner, role: membership.role };
}

export async function savePromptDraft(input: {
  businessId: string;
  aiTone: string;
  aiInstructions: string;
  note: string;
}) {
  const { owner, role } = await requireMembership(input.businessId);
  if (!owner || !role) return { error: "Not authorized." };

  const { release, error } = await saveDraft(
    input.businessId,
    input.aiTone,
    input.aiInstructions,
    input.note,
    owner.email,
  );
  if (error) return { error };

  revalidatePath(`/portal/${input.businessId}/settings`);
  return { error: null, release };
}

// Publishing (and rolling back, the same underlying operation -- see
// publish_prompt_release in supabase/migrations/0046_prompt_releases.sql)
// is owner-only. Saving/editing a draft is fine for staff -- it changes
// nothing customers see until someone actually publishes it -- but
// publish is the one action that immediately changes what Mira says to
// every customer, so it gets the same protection level as other
// high-stakes owner-only actions elsewhere in the portal.
export async function promotePromptRelease(businessId: string, releaseId: string) {
  const { owner, role } = await requireMembership(businessId);
  if (!owner || !role) return { error: "Not authorized." };
  if (role !== "owner") {
    return { error: "Only the business owner can publish or roll back the AI prompt." };
  }

  const { release, error } = await publishRelease(businessId, releaseId, owner.email);
  if (error) return { error };

  revalidatePath(`/portal/${businessId}/settings`);
  return { error: null, release };
}

// Controls whether the inventory assistant (app/portal/.../inventory/)
// is allowed to write anything for this business at all, and which LLM
// provider handles it. Owner-only -- this is a strictly more powerful
// toggle than publish/rollback (it's the on/off switch for a whole
// write-capable feature, not one content change), so it gets at least
// the same protection level.
export async function saveAgentSettings(businessId: string, enabled: boolean, provider: ProviderName) {
  const { owner, role } = await requireMembership(businessId);
  if (!owner || !role) return { error: "Not authorized." };
  if (role !== "owner") {
    return { error: "Only the business owner can change this." };
  }

  const { error } = await updateAgentSettings(businessId, enabled, provider);
  if (error) return { error };

  revalidatePath(`/portal/${businessId}/settings`);
  revalidatePath(`/portal/${businessId}/inventory`);
  return { error: null };
}
