import { NextRequest, NextResponse } from "next/server";
import { runNudgeCheck } from "@/lib/nudges/checkRules";

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

  const summary = await runNudgeCheck();
  return NextResponse.json(summary);
}
