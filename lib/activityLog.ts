import { createClient } from "@/lib/supabase/server";

export type ActivityEntityType =
  | "service" | "product" | "promotion" | "closure" | "faq" | "policy" | "hours" | "business" | "conversation";
export type ActivityAction = "created" | "updated" | "deleted";

// Small shared helper so every actions.ts file writes to activity_log
// the same way, rather than seven slightly different insert calls.
// Deliberately fire-and-forget in spirit: a logging failure should
// never be why a real mutation reports an error to the admin, so
// callers don't need to check this call's result.
export async function logActivity(
  businessId: string,
  entityType: ActivityEntityType,
  entityId: string | null,
  action: ActivityAction,
  summary: string,
  source: "admin_ui" | "command_center" = "admin_ui"
) {
  const supabase = await createClient();
  await supabase.from("activity_log").insert({
    business_id: businessId,
    entity_type: entityType,
    entity_id: entityId,
    action,
    summary,
    source,
  });
}
