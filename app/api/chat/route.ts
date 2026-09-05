import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { processMessage, ProcessMessageError } from "@/lib/chat/processMessage";
import { withConversationLease } from "@/lib/chat/durable";
import { CHAT_RATE_LIMIT_PER_MINUTE, checkRateLimit, getRequestIp } from "@/lib/rateLimit";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
export const runtime = "nodejs";
const MAX_MESSAGE_LENGTH = 4000;
type Body = { businessSlug?: unknown; message?: unknown; visitorId?: unknown };
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as Body | null;
  const slug = typeof body?.businessSlug === "string" ? body.businessSlug.trim() : "";
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  const visitor = typeof body?.visitorId === "string" ? body.visitorId.trim() : "";
  if (!slug || !message) return NextResponse.json({ error: "businessSlug and message are required." }, { status: 400 });
  if (message.length > MAX_MESSAGE_LENGTH) return NextResponse.json({ error: `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer.` }, { status: 400 });
  const client = createServiceRoleClient(); const ip = getRequestIp(request); const identity = visitor || ip;
  const limits = await Promise.all([checkRateLimit(client, `chat:${identity}`, CHAT_RATE_LIMIT_PER_MINUTE), checkRateLimit(client, `chat-ip:${ip}`, 120), checkRateLimit(client, "chat-global", 2000)]);
  const rejected = limits.find((item) => !item.allowed);
  if (rejected) return NextResponse.json({ error: rejected.error ? "Chat protection is temporarily unavailable." : "Too many messages. Please try again later." }, { status: rejected.error ? 503 : 429, headers: { "Retry-After": String(rejected.retryAfterSeconds ?? 60) } });
  const business = await client.from("businesses").select("id,is_active").eq("slug", slug).maybeSingle();
  if (business.error) return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  if (!business.data?.is_active) return NextResponse.json({ error: "Business not found." }, { status: 404 });
  const session = `web_${visitor || randomUUID()}`;
  try {
    const result = await withConversationLease(client, `web:${business.data.id}:${session}`, () => processMessage(business.data.id, session, message, "web"));
    const encoder = new TextEncoder(); const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token: result.reply })}\n\n`)); controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, messageId: result.messageId, productImages: result.productImages })}\n\n`)); controller.close(); } });
    const response = new NextResponse(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" } });
    response.cookies.set("mira_session", session, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 30, path: "/" }); return response;
  } catch (error) { const status = error instanceof ProcessMessageError ? error.status : 500; return NextResponse.json({ error: status === 409 ? "This conversation is busy. Please retry shortly." : "Something went wrong. Please try again." }, { status }); }
}
