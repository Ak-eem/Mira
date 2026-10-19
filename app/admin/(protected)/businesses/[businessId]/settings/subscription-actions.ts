"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAdmin } from "@/lib/supabase/admin-auth";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activityLog";
import { describeSubscriptionChange } from "@/lib/activitySummaries";

export async function updateSubscription(input: {
  businessId: string;
  plan: "base" | "pro";
  nudgesAddon: boolean;
  nudgesTier: "basic" | "plus" | "";
  maxNudgesPerCustomerPerWeek: string;
  status: "trialing" | "active" | "past_due" | "cancelled";
}): Promise<{ error: string | null; saved?: { plan: string; status: string; expires_at: string | null; trial_ends_at: string | null } }> {
  const admin = await getCurrentAdmin();
  if (!admin) return { error: "Not authenticated." };

  const maxPerWeek = Number(input.maxNudgesPerCustomerPerWeek);
  if (Number.isNaN(maxPerWeek) || maxPerWeek <= 0) {
    return { error: "Max nudges per week must be a number greater than 0." };
  }
  if (input.nudgesAddon && !input.nudgesTier) {
    return { error: "Pick a Nudges tier if the add-on is active." };
  }

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("business_subscriptions")
    .select("plan, status, nudges_addon, nudges_tier, max_nudges_per_customer_per_week")
    .eq("business_id", input.businessId)
    .maybeSingle();
  const { error } = await supabase.from("business_subscriptions").upsert(
    {
      business_id: input.businessId,
      plan: input.plan,
      nudges_addon: input.nudgesAddon,
      nudges_tier: input.nudgesAddon ? input.nudgesTier : null,
      max_nudges_per_customer_per_week: maxPerWeek,
      status: input.status,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "business_id" },
  );

  if (error) return { error: error.message };

  // Read the row back so the admin sees what is actually stored, not what the form
  // held. A save that changed nothing (or changed something else) must not look fine.
  const { data: saved, error: readError } = await supabase
    .from("business_subscriptions")
    .select("plan, status, expires_at, trial_ends_at")
    .eq("business_id", input.businessId)
    .maybeSingle();
  if (readError || !saved) return { error: readError?.message ?? "Saved, but the row could not be read back." };
  if (saved.plan !== input.plan || saved.status !== input.status) {
    return { error: `Save did not take effect: stored plan is "${saved.plan}", status "${saved.status}".` };
  }

  const change = describeSubscriptionChange(before, {
    plan: input.plan,
    status: input.status,
    nudges_addon: input.nudgesAddon,
    nudges_tier: input.nudgesAddon ? input.nudgesTier : null,
    max_nudges_per_customer_per_week: maxPerWeek,
  });
  await logActivity(input.businessId, "business", input.businessId, "updated", `${change} (by ${admin.email})`);
  revalidatePath(`/admin/businesses/${input.businessId}/settings`);
  revalidatePath("/admin/businesses");
  revalidatePath("/portal", "layout");
  return { error: null, saved };
}
