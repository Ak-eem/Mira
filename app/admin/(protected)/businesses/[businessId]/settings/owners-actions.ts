"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAdmin } from "@/lib/supabase/admin-auth";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { logActivity } from "@/lib/activityLog";

// auth.admin.inviteUserByEmail needs the service-role key -- Supabase
// gates it by which key constructed the client, not by RLS, so the
// getCurrentAdmin() check here IS the security boundary for this one
// action, not a UX nicety like it is everywhere else.
export async function inviteBusinessOwner(businessId: string, email: string): Promise<{ error: string | null }> {
  const admin = await getCurrentAdmin();
  if (!admin) return { error: "Not authenticated." };

  const trimmedEmail = email.trim();
  if (!trimmedEmail) return { error: "Email is required." };

  const serviceRole = createServiceRoleClient();

  // Supabase returns an existing user (rather than erroring) if this
  // email is already registered -- covers "this person already owns a
  // different business on Mira and now owns this one too" without a
  // separate lookup-then-branch.
  const { data: invited, error: inviteError } = await serviceRole.auth.admin.inviteUserByEmail(trimmedEmail);
  if (inviteError) return { error: inviteError.message };
  if (!invited.user) return { error: "Invite succeeded but no user was returned." };

  const { error: linkError } = await serviceRole
    .from("business_owners")
    .insert({ business_id: businessId, user_id: invited.user.id, role: "owner" });

  if (linkError) {
    if (linkError.code === "23505") return { error: "This person already has portal access to this business." };
    return { error: linkError.message };
  }

  await logActivity(businessId, "business", businessId, "updated", `Invited ${trimmedEmail} to the business portal`);
  revalidatePath(`/admin/businesses/${businessId}/settings`);
  return { error: null };
}

export async function removeBusinessOwner(businessId: string, ownerRowId: string): Promise<void> {
  const admin = await getCurrentAdmin();
  if (!admin) return;

  const supabase = await createClient();
  const { error } = await supabase
    .from("business_owners")
    .delete()
    .eq("id", ownerRowId)
    .eq("business_id", businessId);

  if (error) console.error("Failed to remove business owner:", error);
  revalidatePath(`/admin/businesses/${businessId}/settings`);
}
