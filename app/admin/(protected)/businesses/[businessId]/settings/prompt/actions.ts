"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAdmin } from "@/lib/supabase/admin-auth";
import { logActivity } from "@/lib/activityLog";
import { saveDraft, publishRelease } from "@/lib/promptReleases";

export async function savePromptDraft(input: {
  businessId: string;
  aiTone: string;
  aiInstructions: string;
  note: string;
}) {
  const admin = await getCurrentAdmin();
  if (!admin) return { error: "Not authenticated." };

  const { release, error } = await saveDraft(
    input.businessId,
    input.aiTone,
    input.aiInstructions,
    input.note,
    admin.email,
  );
  if (error) return { error };

  revalidatePath(`/admin/businesses/${input.businessId}/settings/prompt`);
  return { error: null, release };
}

// Backs both "Publish" (releaseId = the current draft) and "Roll back to
// this version" (releaseId = any older published release) -- see
// publish_prompt_release in supabase/migrations/0046_prompt_releases.sql
// for why they're the same underlying operation.
export async function promotePromptRelease(businessId: string, releaseId: string) {
  const admin = await getCurrentAdmin();
  if (!admin) return { error: "Not authenticated." };

  const { release, error } = await publishRelease(businessId, releaseId, admin.email);
  if (error) return { error };

  await logActivity(
    businessId,
    "prompt_release",
    releaseId,
    "updated",
    `${admin.email} published prompt v${release?.version}`,
  );

  revalidatePath(`/admin/businesses/${businessId}/settings/prompt`);
  return { error: null, release };
}
