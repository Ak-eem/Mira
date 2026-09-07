import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { checkRateLimit, getRequestIp } from "@/lib/rateLimit";

export const runtime = "nodejs";

// Server-authoritative rating->emoji mapping: the widget only ever sends
// the numeric rating, never the emoji itself, so a tampered client can't
// store an emoji that doesn't match the number next to it.
const RATING_EMOJI: Record<number, string> = {
  1: "😠",
  2: "🙁",
  3: "😐",
  4: "🙂",
  5: "😄",
};

type Body = { businessSlug?: unknown; visitorId?: unknown; conversationId?: unknown; rating?: unknown };

// Lets a customer rate a conversation they just ended themselves. Scoped
// like the rest of the customer chat surface (business_id + session_token
// = web_${visitorId}) plus a requirement that ended_by = 'customer' --
// this endpoint is only ever a valid rating target for a conversation
// this same visitor ended through /api/chat/end, not an operator-ended
// or still-open one.
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as Body | null;
  const slug = typeof body?.businessSlug === "string" ? body.businessSlug.trim() : "";
  const visitor = typeof body?.visitorId === "string" ? body.visitorId.trim() : "";
  const conversationId = typeof body?.conversationId === "string" ? body.conversationId.trim() : "";
  const rating = typeof body?.rating === "number" ? body.rating : Number(body?.rating);

  if (!slug || !visitor || !conversationId) {
    return NextResponse.json(
      { error: "businessSlug, visitorId, and conversationId are required." },
      { status: 400 },
    );
  }
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: "rating must be an integer from 1 to 5." }, { status: 400 });
  }

  const client = createServiceRoleClient();
  const ip = getRequestIp(request);
  const limits = await Promise.all([
    checkRateLimit(client, `chat-rate:${visitor}`, 20),
    checkRateLimit(client, `chat-rate-ip:${ip}`, 60),
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

  const { data: updated, error: updateError } = await client
    .from("conversations")
    .update({
      customer_rating: rating,
      customer_rating_emoji: RATING_EMOJI[rating],
      customer_rated_at: new Date().toISOString(),
    })
    .eq("id", conversationId)
    .eq("business_id", business.data.id)
    .eq("session_token", `web_${visitor}`)
    .eq("ended_by", "customer")
    .select("id")
    .maybeSingle();

  if (updateError) return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  if (!updated) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });

  return NextResponse.json({ rated: true, emoji: RATING_EMOJI[rating] });
}
