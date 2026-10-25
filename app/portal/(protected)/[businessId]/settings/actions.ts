"use server";

import { revalidatePath } from "next/cache";
import { getCurrentBusinessOwner } from "@/lib/supabase/portal-auth";
import { createClient } from "@/lib/supabase/server";
import { CANCEL_CONFIRMATION_WORD } from "@/lib/cancelSubscription";
import { DELETE_REQUEST_SUMMARY, DELETE_REQUEST_WORD } from "@/lib/deletionRequest";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { sendEmailWithResend } from "@/lib/email/resend";
import { saveDraft, publishRelease } from "@/lib/promptReleases";
import { updateOrderTakingEnabled } from "@/lib/orderSettings";
import { updateGroundingSettings } from "@/lib/groundingSettings";
import { updateBrandColor } from "@/lib/brandSettings";
import { checkBrandColor } from "@/lib/brandColor";

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

// Turns AI order-taking on or off for this business. Owner-only, same
// protection level as the inventory assistant toggle: it decides whether Mira
// may start creating orders from chat at all. On by default (0059).
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

// Owner-only: the colour customers see on the chat page and website widget. Pass null
// to go back to Mira's default. Validated here as well as in the database.
export async function saveBrandColor(businessId: string, color: string | null) {
  const { owner, role } = await requireMembership(businessId);
  if (!owner || !role) return { error: "Not authorized." };
  if (role !== "owner") return { error: "Only the business owner can change this." };

  let value: string | null = null;
  if (color !== null) {
    const checked = checkBrandColor(color);
    if (!checked.ok) return { error: checked.error };
    value = checked.color;
  }

  const { error } = await updateBrandColor(businessId, value);
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

// Owner asks Mira's team to delete the account and its data. Recorded in the activity log
// (visible to the admin on the business's settings page) and emailed to the operator;
// the deletion itself is still carried out by a person. Asking twice is harmless.
export async function requestAccountDeletion(
  businessId: string,
  confirmation: string,
): Promise<{ error: string | null; alreadyRequested?: boolean }> {
  const { owner, role } = await requireMembership(businessId);
  if (!owner || role !== "owner") return { error: "Only the business owner can request deletion." };
  if (confirmation.trim() !== DELETE_REQUEST_WORD) return { error: `Type ${DELETE_REQUEST_WORD} exactly to confirm.` };

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("activity_log")
    .select("id")
    .eq("business_id", businessId)
    .eq("entity_type", "business")
    .like("summary", `${DELETE_REQUEST_SUMMARY}%`)
    .limit(1);
  if (existing && existing.length > 0) return { error: null, alreadyRequested: true };

  const businessName = owner.businesses.find((b) => b.id === businessId)?.name ?? "Unknown business";
  const { error: logError } = await createServiceRoleClient().from("activity_log").insert({
    business_id: businessId,
    entity_type: "business",
    entity_id: businessId,
    action: "updated",
    summary: `${DELETE_REQUEST_SUMMARY} by ${owner.email}`,
    source: "portal_ui",
  });
  if (logError) {
    console.error("Could not record deletion request:", logError);
    return { error: "Could not send your request right now. Please try again, or contact support." };
  }

  // Best effort: the request is already recorded, so a mail problem must not undo it.
  const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
  const to = process.env.CUSTOM_REQUEST_TO_EMAIL || process.env.CONTACT_TO_EMAIL;
  try {
    if (to) {
      await sendEmailWithResend({
        to,
        replyTo: owner.email || undefined,
        subject: `[Account deletion request] ${businessName}`,
        html: `<p><b>Business:</b> ${esc(businessName)} (${esc(businessId)})</p><p><b>Requested by:</b> ${esc(owner.email)}</p><p>Confirm with the owner before deleting. Admin &gt; business &gt; Settings &gt; Delete business.</p>`,
      });
    }
    if (owner.email) {
      await sendEmailWithResend({
        to: owner.email,
        subject: `We received your request to delete ${businessName}`,
        html: `<p>We received your request to delete <b>${esc(businessName)}</b> and its data from Mira.</p><p>Nothing has been deleted yet. We'll confirm with you at this email address first. Deletion is done by a person, so it is not instant.</p><p>If you did not make this request, reply to this email.</p>`,
      });
    }
  } catch (error) {
    console.error("Deletion request email failed:", error);
  }

  revalidatePath(`/portal/${businessId}/settings`);
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
