import type { createServiceRoleClient } from "@/lib/supabase/service-role";
import { assessGrounding, type GroundingInput, type GroundingResult } from "@/lib/grounding/assess";

type Client = ReturnType<typeof createServiceRoleClient>;

const MAX_QUESTION_LENGTH = 500;
const MAX_SIGNAL_VALUE_LENGTH = 120;

/**
 * Scores a reply and stores the result. Meant to run inside after(): it is
 * best-effort, never throws, and a missing table (migration 0055 not applied)
 * only logs -- the customer's reply has already been sent.
 */
export async function recordGroundingAssessment(
  supabase: Client,
  args: { businessId: string; messageId: string; question: string; input: GroundingInput },
): Promise<GroundingResult | null> {
  try {
    const result = assessGrounding(args.input);
    const { error } = await supabase.from("message_assessments").upsert(
      {
        message_id: args.messageId,
        business_id: args.businessId,
        verdict: result.verdict,
        signals: result.signals.map((signal) => ({ ...signal, value: signal.value.slice(0, MAX_SIGNAL_VALUE_LENGTH) })),
        question: args.question.slice(0, MAX_QUESTION_LENGTH),
      },
      { onConflict: "message_id" },
    );
    if (error) {
      console.error("recordGroundingAssessment failed:", error);
      return null;
    }
    return result;
  } catch (error) {
    console.error("recordGroundingAssessment threw:", error);
    return null;
  }
}
