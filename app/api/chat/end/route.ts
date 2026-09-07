import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { checkRateLimit, getRequestIp } from "@/lib/rateLimit";

export const runtime = "nodejs";

type Body = { businessSlug?: unknown; visitorId?: unknown };

// Lets a customer end their own conversation from the widget -- the same
// action an operator already has in admin/portal (see endConversation in
// app/admin/.../conversations/actions.ts), just customer-initiated.
// Scoped exactly like the rest of the customer chat surface (business_id
// + session_token = web_${visitorId}), so a customer can only ever end
// their own conversation, never someone else's.
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as Body | null;
  const slug = typeof body?.businessSlug === "string" ? body.businessSlug.trim() : "";
  const visitor = typeof body?.visitorId === "string" ? body.visitorId.trim() : "";
  if (!slug || !visitor) {
    return NextResponse.json({ error: "businessSlug and visitorId are required." }, { status: 400 });
  }

  const client = createServiceRoleClient();
  const ip = getRequestIp(request);
  const limits = await Promise.all([
    checkRateLimit(client, `chat-end:${visitor}`, 20),
    checkRateLimit(client, `chat-end-ip:${ip}`, 60),
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

  // Only an open conversation can be ended this way -- clears the same
  // claim/handoff state an operator's "End conversation" clears, and the
  // status='closed' transition reuses the value the idle-timeout close
  // and the admin/portal actions already use.
  const { data: conversation, error: updateError } = await client
    .from("conversations")
    .update({
      status: "closed",
      ended_by: "customer",
      claimed_by: null,
      claimed_at: null,
      needs_human: false,
    })
    .eq("business_id", business.data.id)
    .eq("session_token", `web_${visitor}`)
    .eq("status", "open")
    .select("id")
    .maybeSingle();

  if (updateError) return NextResponse.json({ error: "Something went wrong." }, { status: 500 });

  if (!conversation) {
    // Nothing open to end -- a double-tap, a stale tab, or a conversation
    // that was already closed elsewhere. Treat it as already-ended rather
    // than an error so the widget can move straight to the rating prompt.
    return NextResponse.json({ ended: true, conversationId: null });
  }

  return NextResponse.json({ ended: true, conversationId: conversation.id });
}
