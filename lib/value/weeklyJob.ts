import type { SupabaseClient } from "@supabase/supabase-js";
import type { HoursRow } from "@/lib/hours";
import { isLocked, type BusinessSubscription } from "@/lib/plans";
import { afterHoursCount, summaryWindow, weeklySummaryEmail, worthSending, type SummaryWindow, type WeeklyStats } from "./weekly";

const MAX_BUSINESSES = 500;
const CHUNK = 100;
const MAX_ROWS = 5000;

type Client = SupabaseClient;
export type SendEmail = (message: { to: string; subject: string; html: string }) => Promise<unknown>;
type BusinessRow = { id: string; name: string; timezone: string | null; currency: string | null; last_weekly_summary_at: string | null };

async function loadStats(client: Client, businessId: string, window: SummaryWindow, timezone: string): Promise<WeeklyStats> {
  const [conversations, replies, orders, waiting, hours] = await Promise.all([
    client.from("conversations").select("started_at").eq("business_id", businessId).gte("started_at", window.fromIso).lt("started_at", window.toIso).limit(MAX_ROWS),
    client.from("messages").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("role", "assistant").gte("created_at", window.fromIso).lt("created_at", window.toIso),
    client.from("orders").select("total").eq("business_id", businessId).in("status", ["placed", "confirmed", "shipped", "delivered"]).gte("created_at", window.fromIso).lt("created_at", window.toIso).limit(MAX_ROWS),
    client.from("conversations").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("needs_human", true),
    client.from("business_hours").select("day_of_week, opens_at, closes_at").eq("business_id", businessId),
  ]);
  const failed = [conversations, replies, orders, waiting, hours].find((r) => r.error);
  if (failed?.error) throw failed.error;
  const started = (conversations.data ?? []).map((row) => row.started_at as string);
  return {
    conversations: started.length,
    repliesSent: replies.count ?? 0,
    orders: orders.data?.length ?? 0,
    sales: (orders.data ?? []).reduce((sum, row) => sum + Number(row.total ?? 0), 0),
    afterHours: afterHoursCount(started, (hours.data ?? []) as HoursRow[], timezone),
    waitingNow: waiting.count ?? 0,
  };
}

async function ownerEmails(client: Client, businessId: string): Promise<string[]> {
  const { data, error } = await client.from("business_owners").select("user_id").eq("business_id", businessId).eq("role", "owner").eq("weekly_summary", true).limit(10);
  if (error) throw error;
  const emails = new Set<string>();
  for (const owner of data ?? []) {
    const { data: user } = await client.auth.admin.getUserById(owner.user_id);
    const email = user?.user?.email;
    if (email) emails.add(email.toLowerCase());
  }
  return [...emails];
}

// The job itself, with the database client and the email sender passed in so it can be tested without either.
// Emails each paying business's owners what Mira did for them last week. Run daily from the cleanup cron:
// a business is handled once per week (the claim in the database), on Monday to Wednesday in its own
// timezone, so a failed run is retried the next day. Best effort per business: one bad address or one
// failed query never stops the rest. Quiet weeks send nothing.
export async function runWeeklySummaries(client: Client, sendEmail: SendEmail, siteUrl: string, now: Date): Promise<{ checked: number; sent: number }> {
  const { data: subscriptions, error } = await client.from("business_subscriptions").select("*").limit(MAX_BUSINESSES * 2);
  if (error) throw error;
  const ids = (subscriptions ?? []).filter((s) => !isLocked(s as BusinessSubscription)).map((s) => s.business_id as string).slice(0, MAX_BUSINESSES);

  let checked = 0;
  let sent = 0;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data: businesses, error: businessError } = await client
      .from("businesses")
      .select("id, name, timezone, currency, last_weekly_summary_at")
      .in("id", ids.slice(i, i + CHUNK));
    if (businessError) throw businessError;

    for (const business of (businesses ?? []) as BusinessRow[]) {
      try {
        const timezone = business.timezone || "Africa/Lagos";
        const window = summaryWindow(now, timezone);
        if (!window.due) continue;
        if (business.last_weekly_summary_at && new Date(business.last_weekly_summary_at) >= new Date(window.weekStartIso)) continue;
        checked += 1;

        // Claim first: only one run sends this week's summary, however many overlap or retry.
        const { data: claimed, error: claimError } = await client.rpc("claim_weekly_summary", { p_business_id: business.id, p_week_start: window.weekStartIso });
        if (claimError) throw claimError;
        if (!claimed) continue;

        const stats = await loadStats(client, business.id, window, timezone);
        if (!worthSending(stats)) continue;
        const emails = await ownerEmails(client, business.id);
        if (emails.length === 0) continue;

        const base = `${siteUrl}/portal/${business.id}`;
        const message = weeklySummaryEmail({
          businessName: business.name,
          rangeLabel: window.label,
          stats,
          currency: business.currency || "NGN",
          dashboardUrl: base,
          inboxUrl: `${base}/inbox`,
          settingsUrl: `${base}/settings`,
        });
        for (const to of emails) {
          await sendEmail({ to, subject: message.subject, html: message.html });
          sent += 1;
        }
      } catch (error) {
        console.error(`Weekly summary failed for business ${business.id}:`, error);
      }
    }
  }
  return { checked, sent };
}
