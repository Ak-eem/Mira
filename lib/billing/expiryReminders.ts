import "server-only";
import { sendEmailWithResend } from "@/lib/email/resend";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { reminderWindow } from "./periodEnd";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://miraapp.com.ng";
const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// Emails each business owner whose paid plan ends in 2 to 3 days, once. Run daily from
// the cleanup cron: every plan falls in that one-day window exactly once. Best effort per
// business, so one bad address never stops the rest.
export async function sendExpiryReminders(now = Date.now()): Promise<{ checked: number; sent: number }> {
  const client = createServiceRoleClient();
  const { from, to } = reminderWindow(now);
  const { data: subs, error } = await client
    .from("business_subscriptions")
    .select("business_id, expires_at")
    .eq("status", "active")
    .gte("expires_at", from)
    .lt("expires_at", to)
    .limit(200);
  if (error) throw error;

  let sent = 0;
  for (const sub of subs ?? []) {
    try {
      const [{ data: business }, { data: owners }] = await Promise.all([
        client.from("businesses").select("name").eq("id", sub.business_id).maybeSingle(),
        client.from("business_owners").select("user_id").eq("business_id", sub.business_id).eq("role", "owner").limit(5),
      ]);
      if (!business || !owners?.length) continue;
      const endsOn = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", weekday: "long", day: "numeric", month: "long" }).format(new Date(sub.expires_at as string));
      const link = `${SITE_URL}/portal/upgrade?businessId=${encodeURIComponent(sub.business_id)}`;
      for (const owner of owners) {
        const { data } = await client.auth.admin.getUserById(owner.user_id);
        const email = data?.user?.email;
        if (!email) continue;
        await sendEmailWithResend({
          to: email,
          subject: `Your Mira plan for ${business.name} ends on ${endsOn}`,
          html: `<p>Your Mira plan for <b>${esc(business.name)}</b> ends on <b>${esc(endsOn)}</b>.</p><p>After that Mira stops answering your customers. Renew now to keep it on. If you renew before the end date, the new period is added to the end of your current one, so you lose no days.</p><p><a href="${esc(link)}">Renew your plan</a></p>`,
        });
        sent++;
      }
    } catch (error) {
      console.error(`Expiry reminder failed for business ${sub.business_id}:`, error);
    }
  }
  return { checked: subs?.length ?? 0, sent };
}
