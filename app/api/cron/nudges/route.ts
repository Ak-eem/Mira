import { NextRequest, NextResponse } from "next/server";
import { runNudgeCheck } from "@/lib/nudges/checkRules";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

type ServiceRoleClient = ReturnType<typeof createServiceRoleClient>;
const LOCK_NAME = "nudges-cron-lock";
// Cron runs once a day (see vercel.json); a real run finishes in seconds.
// Anything older than this can only be a lock left behind by a run that
// was killed (timeout/crash) before its `finally` cleanup executed.
const STALE_LOCK_MS = 10 * 60 * 1000;

// Acquires the run lock, reclaiming it if the existing one is stale.
// Returns false when another (non-stale) run currently holds it.
async function acquireNudgesCronLock(client: ServiceRoleClient): Promise<boolean> {
  const insert = await client
    .from("system_health_checks")
    .insert({ check_name: LOCK_NAME, checked_at: new Date().toISOString() });

  if (!insert.error) return true;
  if (insert.error.code !== "23505") throw insert.error;

  const { data: existing, error: readError } = await client
    .from("system_health_checks")
    .select("checked_at")
    .eq("check_name", LOCK_NAME)
    .maybeSingle();
  if (readError) throw readError;
  if (!existing || Date.now() - new Date(existing.checked_at).getTime() < STALE_LOCK_MS) {
    return false;
  }

  // Stale -- reclaim it, but only if it still matches what we just read
  // (guards against racing another instance reclaiming at the same time).
  const reclaim = await client
    .from("system_health_checks")
    .update({ checked_at: new Date().toISOString() })
    .eq("check_name", LOCK_NAME)
    .eq("checked_at", existing.checked_at)
    .select("check_name");
  if (reclaim.error) throw reclaim.error;
  return (reclaim.data?.length ?? 0) > 0;
}

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
  if (!(await acquireNudgesCronLock(serviceRoleClient))) {
    return NextResponse.json({ skipped: true });
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
