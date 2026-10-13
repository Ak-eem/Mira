import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron/auth";
import { purgeInboundQueues } from "@/lib/cron/purgeInboundQueues";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { sendAlert, sweepAndAlert } from "@/lib/alerts";

// Daily retention job (see vercel.json). Safe to run concurrently or twice:
// it only deletes rows past the cutoff, so there is no lock to manage.
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const client = createServiceRoleClient();
  try {
    const result = await purgeInboundQueues(client);
    // Daily health sweep: unanswered messages and AI provider failures are emailed to ALERT_EMAIL_TO.
    // A failure here must never fail the cleanup itself.
    const sweep = await sweepAndAlert(client).then((outcome) => outcome.result).catch((error) => {
      console.error("alert sweep failed:", error);
      return "failed" as const;
    });
    return NextResponse.json({ ...result, alertSweep: sweep });
  } catch (error) {
    console.error("cleanup cron failed:", error);
    await sendAlert(client, { key: "cron-cleanup-failed", subject: "Daily cleanup job failed", lines: [error instanceof Error ? error.message : "Unknown error"] });
    return NextResponse.json({ error: "Cleanup failed." }, { status: 500 });
  }
}
