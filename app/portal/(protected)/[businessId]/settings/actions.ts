"use server";

import { revalidatePath } from "next/cache";
import { getCurrentBusinessOwner } from "@/lib/supabase/portal-auth";
import { createClient } from "@/lib/supabase/server";
import { CANCEL_CONFIRMATION_WORD } from "@/lib/cancelSubscription";
import { saveDraft, publishRelease } from "@/lib/promptReleases";
import { updateAgentSettings } from "@/lib/agentSettings";
import { updateOrderTakingEnabled } from "@/lib/orderSettings";
import { updateGroundingSettings } from "@/lib/groundingSettings";
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

// Turns AI order-taking on or off for this business. Owner-only, same
// protection level as the inventory assistant toggle: it decides whether Mira
// may start creating orders from chat at all. Off by default.
export async function saveOrderTaking(businessId: string, enabled: boolean) {
  const { owner, role } = await requireMembership(businessId);
  if (!owner || !role) return { error: "Not authorized." };
  if (role !== "owner") {
    return { error: "Only the business owner can change this." };
  }

  const { error } = await updateOrderTakingEnabled(businessId, enabled);
  if (error) return { error };

  revalidatePath(`/portal/${businessId}/settings`);
  return { error: null };
}

// Cancels the subscription. Takes effect immediately on every channel.
//
// Owner only (role = 'owner', not staff). The real permission check is inside
// cancel_business_subscription (migration 0056), which RLS cannot express because
// owners can only read their subscription row. This check just gives a clear
// message first. The typed confirmation is re-checked here, not only in the UI.
export async function cancelSubscription(businessId: string, confirmation: string): Promise<{ error: string | null }> {
  const { owner, role } = await requireMembership(businessId);
  if (!owner || role !== "owner") return { error: "Only the business owner can cancel the subscription." };
  if (confirmation.trim() !== CANCEL_CONFIRMATION_WORD) {
    return { error: `Type ${CANCEL_CONFIRMATION_WORD} exactly to confirm.` };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_business_subscription", { p_business_id: businessId });
  if (error) {
    console.error("cancel_business_subscription failed:", error);
    return { error: "Could not cancel right now. Please try again, or contact support." };
  }

  revalidatePath(`/portal/${businessId}`, "layout");
  return { error: null };
}

// Thresholds for the answer-quality review. Owner-only, like the other AI
// behaviour switches: it decides what lands on the team's review list and
// whether weak replies can hand a chat to a person.
export async function saveGroundingSettings(businessId: string, reviewLevel: string, escalateRepeat: boolean) {
  const { owner, role } = await requireMembership(businessId);
  if (!owner || !role) return { error: "Not authorized." };
  if (role !== "owner") return { error: "Only the business owner can change this." };
  if (reviewLevel !== "low" && reviewLevel !== "medium") return { error: "Invalid review level." };

  const { error } = await updateGroundingSettings(businessId, reviewLevel, escalateRepeat === true);
  if (error) return { error };

  revalidatePath(`/portal/${businessId}/settings`);
  revalidatePath(`/portal/${businessId}/review`);
  return { error: null };
}
