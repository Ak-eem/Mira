import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { checkRateLimit } from "@/lib/rateLimit";

type MessageContextSnapshot = {
  productImages?: { name: string; imageUrl: string }[];
  operatorReply?: boolean;
  systemNotice?: boolean;
};

// Read-only polling for the web widget -- only needed once a conversation
// is flagged needs_human, since that's the one case where a reply
// (an operator's) can appear in the thread without the customer having
// sent anything to trigger a normal response. Not a websocket/real-time
// setup; a few-second poll interval is enough for this scale.
export async function GET(request: NextRequest) {
  const businessSlug = request.nextUrl.searchParams.get("businessSlug");
  const visitorId = request.nextUrl.searchParams.get("visitorId");

  if (!businessSlug || !visitorId) {
    return NextResponse.json({ error: "businessSlug and visitorId are required." }, { status: 400 });
  }

  const rateLimit = checkRateLimit(`poll_${visitorId}`);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const supabase = createServiceRoleClient();

  const { data: business, error: businessError } = await supabase
    .from("businesses")
    .select("id")
    .eq("slug", businessSlug)
    .maybeSingle();

  if (businessError) {
    console.error("Message poll: business lookup failed:", businessError);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
  if (!business) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const sessionToken = `web_${visitorId}`;

  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .select("id, needs_human")
    .eq("business_id", business.id)
    .eq("session_token", sessionToken)
    .eq("status", "open")
    .maybeSingle();

  if (conversationError) {
    console.error("Message poll: conversation lookup failed:", conversationError);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
  if (!conversation) {
    return NextResponse.json({ needsHuman: false, messages: [] });
  }

  const { data: messages, error: messagesError } = await supabase
    .from("messages")
    .select("id, role, content, context_snapshot, created_at")
    .eq("conversation_id", conversation.id)
    .order("created_at", { ascending: true })
    .limit(50);

  if (messagesError) {
    console.error("Message poll: messages fetch failed:", messagesError);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }

  return NextResponse.json({
    needsHuman: conversation.needs_human,
    messages: (messages ?? []).map((m) => {
      const snapshot = m.context_snapshot as MessageContextSnapshot | null;
      return {
        id: m.id,
        role: m.role as "customer" | "assistant",
        content: m.content,
        productImages: snapshot?.productImages ?? [],
        isOperatorReply: snapshot?.operatorReply === true,
        isSystemNotice: snapshot?.systemNotice === true,
      };
    }),
  });
}
