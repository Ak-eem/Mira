import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { checkRateLimit, getRequestIp } from "@/lib/rateLimit";

export const runtime = "nodejs";

type Body = { businessSlug?: unknown; visitorId?: unknown; email?: unknown };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Lets a customer opt in to delivery-update emails from the widget --
// consent + email address are stored keyed on the same business_id +
// session_token (web_${visitorId}) identity every other customer-facing
// route already uses, so an order created against that identifier can
// find this preference later (see sendOrderStatusEmailIfConsented).
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as Body | null;
  const slug = typeof body?.businessSlug === "string" ? body.businessSlug.trim() : "";
  const visitor = typeof body?.visitorId === "string" ? body.visitorId.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";

  if (!slug || !visitor) {
    return NextResponse.json({ error: "businessSlug and visitorId are required." }, { status: 400 });
  }
  if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) {
    return NextResponse.json({ error: "A valid email address is required." }, { status: 400 });
  }

  const client = createServiceRoleClient();
  const ip = getRequestIp(request);
  const limits = await Promise.all([
    checkRateLimit(client, `chat-notify:${visitor}`, 10),
    checkRateLimit(client, `chat-notify-ip:${ip}`, 30),
  ]);
  const rejected = limits.find((item) => !item.allowed);
  if (rejected) {
    return NextResponse.json(
      { error: "Too many requests." },
      { status: rejected.error ? 503 : 429, headers: { "Retry-After": String(rejected.retryAfterSeconds ?? 60) } },
    );
  }

  const business = await client.from("businesses").select("id").eq("slug", slug).maybeSingle();
  if (business.error) return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  if (!business.data) return NextResponse.json({ error: "Not found." }, { status: 404 });

  // opted_out_at is reset to null here on purpose: re-submitting this
  // form is a fresh, explicit consent, so a prior opt-out shouldn't be
  // able to silently keep a customer muted after they've asked back in.
  const { error } = await client.from("customer_notification_preferences").upsert(
    {
      business_id: business.data.id,
      customer_identifier: `web_${visitor}`,
      email,
      consented_at: new Date().toISOString(),
      opted_out_at: null,
    },
    { onConflict: "business_id,customer_identifier" },
  );

  if (error) return NextResponse.json({ error: "Something went wrong." }, { status: 500 });

  return NextResponse.json({ saved: true });
}
