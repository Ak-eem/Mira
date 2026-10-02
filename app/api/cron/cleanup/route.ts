import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron/auth";
import { purgeInboundQueues } from "@/lib/cron/purgeInboundQueues";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

// Daily retention job (see vercel.json). Safe to run concurrently or twice:
// it only deletes rows past the cutoff, so there is no lock to manage.
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    const result = await purgeInboundQueues(createServiceRoleClient());
    return NextResponse.json(result);
  } catch (error) {
    console.error("cleanup cron failed:", error);
    return NextResponse.json({ error: "Cleanup failed." }, { status: 500 });
  }
}
