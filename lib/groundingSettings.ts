import { createClient } from "@/lib/supabase/server";
import type { GroundingReviewLevel } from "@/lib/grounding/settings";

// Written through update_business_settings (migration 0054): owners can read
// their business row but have no UPDATE permission on it, so a direct .update()
// would be silently ignored. The function authorises owners and platform admins
// itself and only touches the settings columns.
export async function updateGroundingSettings(
  businessId: string,
  reviewLevel: GroundingReviewLevel,
  escalateRepeat: boolean,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_business_settings", {
    p_business_id: businessId,
    p_grounding_review_level: reviewLevel,
    p_grounding_escalate_repeat: escalateRepeat,
  });
  return { error: error?.message ?? null };
}
