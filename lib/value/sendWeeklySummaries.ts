import "server-only";
import { sendEmailWithResend } from "@/lib/email/resend";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { runWeeklySummaries } from "./weeklyJob";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://miraapp.com.ng";

// Run daily from the cleanup cron. See runWeeklySummaries for what it does and why it is safe to run twice.
export async function sendWeeklySummaries(now: Date = new Date()): Promise<{ checked: number; sent: number }> {
  return runWeeklySummaries(createServiceRoleClient(), (message) => sendEmailWithResend(message), SITE_URL, now);
}
