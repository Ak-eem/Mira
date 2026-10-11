import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

// Vercel Cron sends `Authorization: Bearer $CRON_SECRET` automatically. Any
// other scheduler can call the same URL with the same header.
export function isAuthorizedCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // The most common reason scheduled jobs silently never run: say so in the logs.
    console.error("CRON_SECRET is not set; rejecting scheduled job request. Set it in Vercel environment variables (Production).");
    return false;
  }

  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(request.headers.get("authorization") ?? "");
  return received.length === expected.length && timingSafeEqual(received, expected);
}
