"use server";

import { revalidatePath } from "next/cache";
import { getCurrentBusinessOwner } from "@/lib/supabase/portal-auth";
import { createClient } from "@/lib/supabase/server";

type TriggerType = "order_shipped" | "restock_alert" | "abandoned_cart";

// One rule per (business, trigger type) -- the unique constraint on
// nudge_rules means there's at most one to ever create or edit per
// type, so this is always an upsert, never a separate create-vs-update
// decision in the UI.
export async function upsertNudgeRule(input: {
  businessId: string;
  triggerType: TriggerType;
  templateName: string;
  hoursThreshold: string; // abandoned_cart only, ignored otherwise
  isActive: boolean;
}): Promise<{ error: string | null }> {
  const owner = await getCurrentBusinessOwner();
  if (!owner || !owner.businesses.some((b) => b.id === input.businessId)) {
    return { error: "Not authorized for this business." };
  }

  const conditionJson: Record<string, unknown> = {};
  if (input.triggerType === "abandoned_cart" && input.hoursThreshold.trim()) {
    const hours = Number(input.hoursThreshold);
    if (Number.isNaN(hours) || hours <= 0) {
      return { error: "Cart age threshold must be a number of hours greater than 0." };
    }
    conditionJson.hours_threshold = hours;
  }

  const supabase = await createClient();
  const { error } = await supabase.from("nudge_rules").upsert(
    {
      business_id: input.businessId,
      trigger_type: input.triggerType,
      template_name: input.templateName.trim() || null,
      condition_json: conditionJson,
      is_active: input.isActive,
    },
    { onConflict: "business_id,trigger_type" },
  );

  if (error) return { error: error.message };

  revalidatePath(`/portal/${input.businessId}/nudges`);
  return { error: null };
}
