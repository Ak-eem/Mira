"use server";

import { getCurrentAdmin } from "@/lib/supabase/admin-auth";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activityLog";
import { zonedWallTimeToUtcISO } from "@/lib/timezone";

export async function createClosure(input: {
  businessId: string;
  startsAt: string;
  endsAt: string;
  reason: string;
}) {
  const admin = await getCurrentAdmin();
  if (!admin) return { error: "Not authenticated." };

  if (!input.startsAt || !input.endsAt) {
    return { error: "Start and end are required." };
  }

  const supabase = await createClient();

  // datetime-local gives a naive "YYYY-MM-DDTHH:mm" with no timezone --
  // without this lookup, Postgres would store it as if it were UTC,
  // shifting the closure window by the business's UTC offset.
  const { data: biz } = await supabase
    .from("businesses")
    .select("timezone")
    .eq("id", input.businessId)
    .maybeSingle();
  const timeZone = biz?.timezone ?? "Africa/Lagos";

  const reason = input.reason.trim() || null;
  const { data: created, error } = await supabase
    .from("closures")
    .insert({
      business_id: input.businessId,
      starts_at: zonedWallTimeToUtcISO(input.startsAt, timeZone),
      ends_at: zonedWallTimeToUtcISO(input.endsAt, timeZone),
      reason,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  await logActivity(input.businessId, "closure", created?.id ?? null, "created", `Closure added: ${reason ?? "no reason given"}`);
  return { error: null };
}

export async function updateClosure(input: {
  closureId: string;
  startsAt: string;
  endsAt: string;
  reason: string;
}) {
  const admin = await getCurrentAdmin();
  if (!admin) return { error: "Not authenticated." };

  if (!input.startsAt || !input.endsAt) {
    return { error: "Start and end are required." };
  }

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("closures")
    .select("business_id")
    .eq("id", input.closureId)
    .maybeSingle();

  let timeZone = "Africa/Lagos";
  if (existing) {
    const { data: biz } = await supabase
      .from("businesses")
      .select("timezone")
      .eq("id", existing.business_id)
      .maybeSingle();
    timeZone = biz?.timezone ?? timeZone;
  }

  const reason = input.reason.trim() || null;
  const { error } = await supabase
    .from("closures")
    .update({
      starts_at: zonedWallTimeToUtcISO(input.startsAt, timeZone),
      ends_at: zonedWallTimeToUtcISO(input.endsAt, timeZone),
      reason,
    })
    .eq("id", input.closureId);

  if (error) return { error: error.message };

  if (existing) {
    await logActivity(existing.business_id, "closure", input.closureId, "updated", `Closure updated: ${reason ?? "no reason given"}`);
  }
  return { error: null };
}

export async function deleteClosure(closureId: string) {
  const admin = await getCurrentAdmin();
  if (!admin) return { error: "Not authenticated." };

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("closures")
    .select("business_id")
    .eq("id", closureId)
    .maybeSingle();

  const { error } = await supabase.from("closures").delete().eq("id", closureId);
  if (error) return { error: error.message };

  if (existing) {
    await logActivity(existing.business_id, "closure", closureId, "deleted", "Closure removed");
  }
  return { error: null };
}
