import type { SupabaseClient } from "@supabase/supabase-js";

export type GroundingReviewLevel = "low" | "medium";
export type GroundingSettings = { reviewLevel: GroundingReviewLevel; escalateRepeat: boolean };

export const DEFAULT_GROUNDING_SETTINGS: GroundingSettings = { reviewLevel: "low", escalateRepeat: false };

/**
 * Per-business thresholds for the answer-quality check:
 *  - reviewLevel: "low" puts only low-grounding replies on the review list,
 *    "medium" adds the medium ones too.
 *  - escalateRepeat: when on, two weak replies in a row hand the chat to the
 *    team through the same needs_human path the "I don't know" fallback uses.
 *
 * Read separately from buildBusinessContext on purpose: if the columns don't
 * exist yet (migration 0054 not applied) this quietly returns the defaults
 * instead of making every customer chat fail to load its business.
 */
export async function getGroundingSettings(supabase: SupabaseClient, businessId: string): Promise<GroundingSettings> {
  try {
    const { data, error } = await supabase
      .from("businesses")
      .select("grounding_review_level, grounding_escalate_repeat")
      .eq("id", businessId)
      .maybeSingle();
    if (error || !data) return DEFAULT_GROUNDING_SETTINGS;
    return {
      reviewLevel: data.grounding_review_level === "medium" ? "medium" : "low",
      escalateRepeat: data.grounding_escalate_repeat === true,
    };
  } catch {
    return DEFAULT_GROUNDING_SETTINGS;
  }
}
