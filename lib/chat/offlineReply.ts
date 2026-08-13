import type { SupabaseClient } from "@supabase/supabase-js";
import { WEEKDAY_NAMES, WEEKDAY_SHORT_TO_INDEX, formatTime, isOpenNow, type HoursRow } from "@/lib/hours";

// Deliberately not every message -- only the first message of a brand-new
// conversation. Mira doesn't get tired: a catalog/FAQ question at 11pm is
// something the AI can answer correctly right now, and replacing that with
// a canned "we're closed" message is a downgrade for a question that never
// needed a human. Gating only the opener sets expectations immediately
// (fast, no LLM call) without giving up the AI's usefulness for the rest
// of the conversation -- buildContext already puts "Currently: OPEN/CLOSED"
// in the AI's own system prompt, so later messages are still hours-aware.
//
// Small, deliberate query duplication with buildContext here (business
// timezone + business_hours + closures) rather than refactoring
// buildContext to expose its internals -- this is a narrow, additive
// feature and buildContext's fitting/caching logic works today; not worth
// the risk of touching it for this.
export async function getOfflineGateReply(
  supabase: SupabaseClient,
  businessId: string,
): Promise<string | null> {
  const [{ data: business }, { data: hours }, { data: allClosures }] = await Promise.all([
    supabase.from("businesses").select("name,timezone").eq("id", businessId).maybeSingle(),
    supabase.from("business_hours").select("day_of_week,opens_at,closes_at").eq("business_id", businessId),
    supabase.from("closures").select("starts_at,ends_at,reason").eq("business_id", businessId),
  ]);

  if (!business) return null;

  const now = new Date();
  const activeClosure = (allClosures ?? []).find(
    (c) => new Date(c.starts_at) <= now && new Date(c.ends_at) >= now,
  );

  if (activeClosure) {
    return closureReply(business.name, activeClosure.ends_at, business.timezone);
  }

  const open = isOpenNow(hours ?? [], business.timezone);
  // false = confirmed closed -> gate. true or null (open, or undetermined
  // e.g. bad timezone data) -> don't gate. On genuine ambiguity, defer to
  // the AI pipeline (which still has the same OPEN/CLOSED fact in its own
  // context) rather than the blunt canned message.
  if (open !== false) return null;

  return hoursReply(business.name, hours ?? [], business.timezone);
}

function closureReply(businessName: string, endsAt: string, timezone: string): string {
  const end = new Date(endsAt);
  const daysAway = Math.ceil((end.getTime() - Date.now()) / 86_400_000);

  if (daysAway > 14) {
    return `Thanks for reaching out! ${businessName} is temporarily closed right now. We'll get back to you as soon as we reopen.`;
  }

  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
    hour: "numeric",
    minute: "2-digit",
  }).format(end);

  return `Thanks for reaching out! ${businessName} is temporarily closed right now, back ${formatted}. We'll get back to you when we reopen.`;
}

function hoursReply(businessName: string, hours: HoursRow[], timezone: string): string {
  const next = findNextOpen(hours, timezone);
  const when = next ? `, back ${next}` : "";
  return `Thanks for reaching out! ${businessName} is closed right now${when}. Go ahead and ask — I'll do what I can, and the team will follow up on anything else when we're open.`;
}

// Checks today's remaining hours first, then scans forward up to 7 days.
// Same "doesn't handle overnight-spanning hours" gap as isOpenNow -- not
// solving that here either.
function findNextOpen(hours: HoursRow[], timezone: string): string | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date());

    const weekday = parts.find((p) => p.type === "weekday")?.value;
    const hour = parts.find((p) => p.type === "hour")?.value;
    const minute = parts.find((p) => p.type === "minute")?.value;
    if (!weekday || hour === undefined || minute === undefined) return null;

    const todayIndex = WEEKDAY_SHORT_TO_INDEX[weekday];
    const nowMinutes = Number(hour) * 60 + Number(minute);

    for (let offset = 0; offset < 7; offset += 1) {
      const dayIndex = (todayIndex + offset) % 7;
      const row = hours.find((h) => h.day_of_week === dayIndex);
      if (!row || !row.opens_at) continue;

      const [openH, openM] = row.opens_at.split(":").map(Number);
      const opensAtMinutes = openH * 60 + openM;
      if (offset === 0 && opensAtMinutes <= nowMinutes) continue; // already passed today

      const time = formatTime(row.opens_at);
      if (offset === 0) return `today at ${time}`;
      if (offset === 1) return `tomorrow at ${time}`;
      return `${WEEKDAY_NAMES[dayIndex]} at ${time}`;
    }

    return null;
  } catch {
    return null;
  }
}
