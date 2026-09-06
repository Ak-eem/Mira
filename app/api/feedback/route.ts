import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { checkRateLimit, FEEDBACK_RATE_LIMIT_PER_MINUTE, getRequestIp } from "@/lib/rateLimit";

export async function POST(request: NextRequest) {
  const supabase = createServiceRoleClient();
  const rateLimit = await checkRateLimit(supabase, `feedback:${getRequestIp(request)}`, FEEDBACK_RATE_LIMIT_PER_MINUTE);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const messageId = body?.messageId as string | undefined;
  const rating = body?.rating as string | undefined;

  if (!messageId || (rating !== "up" && rating !== "down")) {
    return NextResponse.json(
      { error: "messageId and a valid rating ('up' or 'down') are required." },
      { status: 400 },
    );
  }

  // Confirms this is a real assistant message before recording feedback
  // against it -- one extra query, keeps the endpoint from silently
  // accepting feedback against an arbitrary or guessed id.
  const { data: message, error: messageError } = await supabase
    .from("messages")
    .select("id, role")
    .eq("id", messageId)
    .maybeSingle();

  if (messageError) {
    console.error("Feedback message lookup failed:", messageError);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
  if (!message || message.role !== "assistant") {
    return NextResponse.json({ error: "Message not found." }, { status: 404 });
  }

  const { error: upsertError } = await supabase.from("message_feedback").upsert(
    { message_id: messageId, rating, updated_at: new Date().toISOString() },
    { onConflict: "message_id" },
  );

  if (upsertError) {
    console.error("Feedback upsert failed:", upsertError);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }

  return NextResponse.json({ status: "ok" });
}
