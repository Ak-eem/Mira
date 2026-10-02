import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { checkRateLimit, getRequestIp } from "@/lib/rateLimit";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
const body = (await request.json().catch(() => null)) as { email?: unknown } | null;
const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });
const client = createServiceRoleClient();
const ip = getRequestIp(request);
const limits = await Promise.all([
checkRateLimit(client, `login:${email}`, 5),
checkRateLimit(client, `login-ip:${ip}`, 20),
]);
const rejected = limits.find((l) => !l.allowed);
if (rejected) {
return NextResponse.json(
{ error: "Too many login attempts. Try again later." },
{ status: rejected.error ? 503 : 429, headers: { "Retry-After": String(rejected.retryAfterSeconds ?? 900) } }
);
}
return NextResponse.json({ allowed: true });
}
