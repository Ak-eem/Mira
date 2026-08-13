"use server";

import { getCurrentAdmin } from "@/lib/supabase/admin-auth";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activityLog";

export type DayInput = {
  day_of_week: number;
  closed: boolean;
  opens_at: string;
  closes_at: string;
};

export async function saveHours(businessId: string, days: DayInput[]) {
  const admin = await getCurrentAdmin();
  if (!admin) return { error: "Not authenticated." };

  const supabase = await createClient();

  const rows = days.map((d) => ({
    business_id: businessId,
    day_of_week: d.day_of_week,
    opens_at: d.closed ? null : d.opens_at,
    closes_at: d.closed ? null : d.closes_at,
  }));

  const { error } = await supabase
    .from("business_hours")
    .upsert(rows, { onConflict: "business_id,day_of_week" });

  if (error) return { error: error.message };

  // One entry for the whole save, not per day -- diffing all 7 days'
  // before/after would be a lot of complexity for modest value here.
  await logActivity(businessId, "hours", null, "updated", "Hours updated");
  return { error: null };
}
