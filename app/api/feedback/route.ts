import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { checkRateLimit, FEEDBACK_RATE_LIMIT_PER_MINUTE, getRequestIp } from "@/lib/rateLimit";
import { parseCustomerFeedback } from "@/lib/feedback/parseFeedback";

// The customer's side of feedback: a thumbs rating, optionally with a reason
// after a thumbs-down. Written with the service-role key (the widget has no
// identity an RLS policy could check), so ownership is verified here instead:
// the message must belong to a conversation of THIS business and THIS visitor.
// Staff reviews are a different row (source = 'staff') written by signed-in
// business members under their own RLS policies -- never through this route.
export async function POST(request: NextRequest) {
  const supabase = createServiceRoleClient();
  const rateLimit = await checkRateLimit(supabase, `feedback:${getRequestIp(request)}`, FEEDBACK_RATE_LIMIT_PER_MINUTE);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const parsed = parseCustomerFeedback(await request.json().catch(() => null));
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { messageId, rating, reason, businessSlug, visitorId } = parsed.value;

  const { data: business, error: businessError } = await supabase
    .from("businesses")
    .select("id")
    .eq("slug", businessSlug)
    .maybeSingle();
  if (businessError) {
    console.error("Feedback business lookup failed:", businessError);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
  if (!business) return NextResponse.json({ error: "Message not found." }, { status: 404 });

  const { data: message, error: messageError } = await supabase
    .from("messages")
    .select("id, role, business_id, conversation_id")
    .eq("id", messageId)
    .maybeSingle();
  if (messageError) {
    console.error("Feedback message lookup failed:", messageError);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
  if (!message || message.role !== "assistant" || message.business_id !== business.id) {
    return NextResponse.json({ error: "Message not found." }, { status: 404 });
  }

  // Same identity the rest of the customer chat surface uses: web_<visitorId>.
  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .select("session_token")
    .eq("id", message.conversation_id)
    .eq("business_id", business.id)
    .maybeSingle();
  if (conversationError) {
    console.error("Feedback conversation lookup failed:", conversationError);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
  if (!conversation || conversation.session_token !== `web_${visitorId}`) {
    return NextResponse.json({ error: "Message not found." }, { status: 404 });
  }

  const { error: upsertError } = await supabase.from("message_feedback").upsert(
    {
      message_id: messageId,
      source: "customer",
      rating,
      reason,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "message_id,source" },
  );

  if (upsertError) {
    console.error("Feedback upsert failed:", upsertError);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }

  return NextResponse.json({ status: "ok" });
}
