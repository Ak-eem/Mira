import { NextRequest, NextResponse } from "next/server";
import { runNudgeCheck } from "@/lib/nudges/checkRules";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

// Vercel Cron sends the configured Authorization header automatically
// (see vercel.json) -- this just has to match. If this project doesn't
// end up on Vercel, point any scheduler (GitHub Actions cron, Supabase
// pg_cron calling this over http, an external uptime-style pinger) at
// this same URL with the same header; nothing else here is Vercel-specific.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const serviceRoleClient = createServiceRoleClient();
  const lock = await serviceRoleClient
    .from("system_health_checks")
    .insert({
      check_name: "nudges-cron-lock",
      checked_at: new Date().toISOString(),
    });

  if (lock.error) {
    if (lock.error.code === "23505") {
      return NextResponse.json({ skipped: true });
    }
    throw lock.error;
  }

  try {
    const summary = await runNudgeCheck();
    await serviceRoleClient.from("system_health_checks").upsert({
      check_name: "nudges-cron",
      checked_at: new Date().toISOString(),
    });
    return NextResponse.json(summary);
  } finally {
    await serviceRoleClient
      .from("system_health_checks")
      .delete()
      .eq("check_name", "nudges-cron-lock");
  }
}
