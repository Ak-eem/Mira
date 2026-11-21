"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAdmin } from "@/lib/supabase/admin-auth";
import { checkChatColors } from "@/lib/brandColor";
import { updateChatColors } from "@/lib/brandSettings";
import { updateOrderTakingEnabled } from "@/lib/orderSettings";
import { updateGroundingSettings } from "@/lib/groundingSettings";
import type { GroundingReviewLevel } from "@/lib/grounding/settings";

// The same switches the owner has in their portal, for Mira staff acting on an owner's behalf.
// Each one only checks that the caller is a platform admin; the database functions they call
// authorise platform admins themselves (migrations 0054 and 0064).
const revalidate = (businessId: string) => revalidatePath(`/admin/businesses/${businessId}/settings`);

export async function saveChatColorsAsAdmin(businessId: string, colors: { brand: string | null; background: string | null }) {
  if (!(await getCurrentAdmin())) return { error: "Not authenticated." };
  const checked = checkChatColors(colors);
  if (!checked.ok) return { error: checked.error };
  const { error } = await updateChatColors(businessId, { brandColor: checked.brand, backgroundColor: checked.background });
  if (error) return { error };
  revalidate(businessId);
  return { error: null };
}

export async function saveOrderTakingAsAdmin(businessId: string, enabled: boolean) {
  if (!(await getCurrentAdmin())) return { error: "Not authenticated." };
  const { error } = await updateOrderTakingEnabled(businessId, enabled);
  if (error) return { error };
  revalidate(businessId);
  return { error: null };
}

export async function saveGroundingAsAdmin(businessId: string, level: string, escalate: boolean) {
  if (!(await getCurrentAdmin())) return { error: "Not authenticated." };
  const { error } = await updateGroundingSettings(businessId, level as GroundingReviewLevel, escalate);
  if (error) return { error };
  revalidate(businessId);
  return { error: null };
}
