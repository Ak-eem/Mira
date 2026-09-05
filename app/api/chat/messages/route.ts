import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { checkRateLimit, getRequestIp } from "@/lib/rateLimit";
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null; }
export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("businessSlug"); const visitor = request.nextUrl.searchParams.get("visitorId");
  if (!slug || !visitor) return NextResponse.json({ error: "businessSlug and visitorId are required." }, { status: 400 });
  const client = createServiceRoleClient(); const ip = getRequestIp(request); const limits = await Promise.all([checkRateLimit(client, `poll:${visitor}`, 120), checkRateLimit(client, `poll-ip:${ip}`, 300)]); const rejected = limits.find((item) => !item.allowed);
  if (rejected) return NextResponse.json({ error: "Too many requests." }, { status: rejected.error ? 503 : 429, headers: { "Retry-After": String(rejected.retryAfterSeconds ?? 60) } });
  const business = await client.from("businesses").select("id").eq("slug", slug).maybeSingle(); if (business.error) return NextResponse.json({ error: "Something went wrong." }, { status: 500 }); if (!business.data) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const conversation = await client.from("conversations").select("id,needs_human").eq("business_id", business.data.id).eq("session_token", `web_${visitor}`).eq("status", "open").maybeSingle(); if (conversation.error) return NextResponse.json({ error: "Something went wrong." }, { status: 500 }); if (!conversation.data) return NextResponse.json({ needsHuman: false, messages: [] });
  const messages = await client.from("messages").select("id,role,content,context_snapshot,created_at").eq("conversation_id", conversation.data.id).order("created_at", { ascending: true }).limit(50); if (messages.error) return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  return NextResponse.json({ needsHuman: conversation.data.needs_human, messages: (messages.data ?? []).map((item) => { const snapshot = record(item.context_snapshot) ? item.context_snapshot : null; return { id: item.id, role: item.role, content: item.content, productImages: Array.isArray(snapshot?.productImages) ? snapshot.productImages : [], isOperatorReply: snapshot?.operatorReply === true }; }) });
}
