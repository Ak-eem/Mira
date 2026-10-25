import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron/auth";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { sweepUnrepliedWhatsApp } from "@/lib/whatsapp/sweepUnreplied";

export const runtime = "nodejs";
export const maxDuration = 60;

// Finds and finishes WhatsApp messages that were stored but never answered, across every
// business. Safe to run as often as you like (every few minutes is sensible) and
// concurrently with the live webhook: rows are claimed atomically.
// Call with `Authorization: Bearer <CRON_SECRET>`.
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  try {
    return NextResponse.json(await sweepUnrepliedWhatsApp(createServiceRoleClient(), { limit: 25 }));
  } catch (error) {
    console.error("whatsapp-unreplied cron failed:", error);
    return NextResponse.json({ error: "Sweep failed." }, { status: 500 });
  }
}
