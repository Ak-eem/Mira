import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { checkRateLimit, getRequestIp } from "@/lib/rateLimit";
import { isLocked } from "@/lib/plans";
import { CUSTOMER_DELIVERABLE_STATUSES } from "@/lib/orders/status";
import { CONVERSATION_IDLE_TIMEOUT_MS } from "@/lib/chat/conversation";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("businessSlug");
  const visitor = request.nextUrl.searchParams.get("visitorId");
  if (!slug || !visitor) return NextResponse.json({ error: "businessSlug and visitorId are required." }, { status: 400 });

  const client = createServiceRoleClient();
  const ip = getRequestIp(request);
  const limits = await Promise.all([checkRateLimit(client, `poll:${visitor}`, 120), checkRateLimit(client, `poll-ip:${ip}`, 300)]);
  const rejected = limits.find((item) => !item.allowed);
  if (rejected) return NextResponse.json({ error: "Too many requests." }, { status: rejected.error ? 503 : 429, headers: { "Retry-After": String(rejected.retryAfterSeconds ?? 60) } });

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
    return NextResponse.json({
      locked: true,
      needsHuman: false,
      messages: [],
      error: "This chat is temporarily unavailable. Please ask the business owner to upgrade.",
    }, { status: 402 });
  }

  // SECURITY INVARIANT: there is no binding between a visitor and a session
  // beyond knowing the (slug, visitorId) pair, and this endpoint is
  // unauthenticated by design. That is only safe while visitorIds stay
  // unguessable (client-generated random UUIDs). Never derive a visitorId from
  // anything guessable (sequential ids, phone numbers, emails).
  const sessionToken = `web_${visitor}`;

  // Orders this customer can still mark delivered. Scoped to their own
  // identity exactly like the conversation lookup below.
  const pendingOrders = await client
    .from("orders")
    .select("id,status,total,order_items(name,quantity)")
    .eq("business_id", business.data.id)
    .eq("customer_identifier", sessionToken)
    .in("status", [...CUSTOMER_DELIVERABLE_STATUSES])
    .order("status_changed_at", { ascending: false })
    .limit(3);
  const orders = pendingOrders.error
    ? []
    : (pendingOrders.data ?? []).map((order) => ({
        id: order.id,
        status: order.status,
        total: order.total,
        items: (order.order_items ?? []).map((item: { name: string; quantity: number }) => ({ name: item.name, quantity: item.quantity })),
      }));

  const conversation = await client.from("conversations").select("id,needs_human").eq("business_id", business.data.id).eq("session_token", sessionToken).eq("status", "open").maybeSingle();
  if (conversation.error) return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  if (!conversation.data) {
    // Delivery closes the conversation, but web customers have no push
    // channel: this thread IS how they hear about it. So when the most recent
    // conversation closed recently, still hand back its order-update notices
    // (and only those) so "Your order was delivered" isn't lost on close.
    const cutoff = new Date(Date.now() - CONVERSATION_IDLE_TIMEOUT_MS).toISOString();
    const recentlyClosed = await client
      .from("conversations")
      .select("id")
      .eq("business_id", business.data.id)
      .eq("session_token", sessionToken)
      .eq("status", "closed")
      .gte("last_message_at", cutoff)
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (recentlyClosed.error || !recentlyClosed.data) return NextResponse.json({ needsHuman: false, messages: [], orders });

    const notices = await client
      .from("messages")
      .select("id,role,content,context_snapshot,created_at")
      .eq("conversation_id", recentlyClosed.data.id)
      .eq("context_snapshot->>systemNotice", "true")
      .not("context_snapshot->>orderUpdate", "is", null)
      .order("created_at", { ascending: false })
      .limit(5);
    return NextResponse.json({
      needsHuman: false,
      orders,
      messages: (notices.data ?? [])
        .reverse()
        .map((item) => ({ id: item.id, role: item.role, content: item.content, productImages: [], isOperatorReply: false, isSystemNotice: true })),
    });
  }

  const messages = await client.from("messages").select("id,role,content,context_snapshot,created_at").eq("conversation_id", conversation.data.id).order("created_at", { ascending: true }).limit(50);
  if (messages.error) return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  return NextResponse.json({
    needsHuman: conversation.data.needs_human,
    orders,
    messages: (messages.data ?? []).map((item) => {
      const snapshot = record(item.context_snapshot) ? item.context_snapshot : null;
      return { id: item.id, role: item.role, content: item.content, productImages: Array.isArray(snapshot?.productImages) ? snapshot.productImages : [], isOperatorReply: snapshot?.operatorReply === true, isSystemNotice: snapshot?.systemNotice === true };
    }),
  });
}
