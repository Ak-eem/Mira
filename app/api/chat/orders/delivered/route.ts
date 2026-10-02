import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { checkRateLimit, getRequestIp } from "@/lib/rateLimit";
import { isLocked } from "@/lib/plans";
import { transitionOrderStatus } from "@/lib/orders/transition";
import { parseVisitorId } from "@/lib/chat/visitor";

export const runtime = "nodejs";

type Body = { businessSlug?: unknown; visitorId?: unknown; orderId?: unknown };

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The customer's own "I received my order" -- the counterpart to staff
// marking it delivered in the portal. Scoped exactly like /api/chat/end and
// the rest of the customer chat surface: business_id + web_<visitorId>
// identity, and transitionOrderStatus additionally pins the order to that
// identity, so a customer can only ever act on their own order.
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as Body | null;
  const slug = typeof body?.businessSlug === "string" ? body.businessSlug.trim() : "";
  const visitor = parseVisitorId(body?.visitorId) ?? "";
  const orderId = typeof body?.orderId === "string" ? body.orderId.trim() : "";
  if (!slug || !visitor || !UUID_REGEX.test(orderId)) {
    return NextResponse.json({ error: "businessSlug, visitorId and a valid orderId are required." }, { status: 400 });
  }
  const client = createServiceRoleClient();
  const ip = getRequestIp(request);
  const limits = await Promise.all([
    checkRateLimit(client, `order-delivered:${visitor}`, 20),
    checkRateLimit(client, `order-delivered-ip:${ip}`, 60),
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

  const { data: subscription, error: subscriptionError } = await client
    .from("business_subscriptions")
    .select("owner_id,plan,status,trial_started_at,trial_ends_at")
    .eq("business_id", business.data.id)
    .maybeSingle();
  if (subscriptionError) return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  if (isLocked(subscription)) {
    return NextResponse.json(
      { locked: true, error: "This chat is temporarily unavailable. Please ask the business owner to upgrade." },
      { status: 402 },
    );
  }

  const result = await transitionOrderStatus(client, {
    businessId: business.data.id,
    orderId,
    to: "delivered",
    actor: "customer",
    expectedCustomerIdentifier: `web_${visitor}`,
  });

  if (!result.ok) {
    const status = result.error === "Order not found." ? 404 : 409;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ delivered: true });
}
