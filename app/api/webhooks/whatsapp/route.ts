import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { processMessage } from "@/lib/chat/processMessage";
import { withConversationLease } from "@/lib/chat/durable";
import { checkRateLimit, getRequestIp } from "@/lib/rateLimit";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { enqueueInboundMessage, claimInboundMessage, markInboundDone, markInboundFailed } from "@/lib/whatsapp/inboundQueue";
import { sendWhatsappReply } from "@/lib/whatsapp/sendMessage";
export const runtime = "nodejs";
const MAX_MESSAGE_LENGTH = 4000; const VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN; const APP_SECRET = process.env.WHATSAPP_APP_SECRET;
type R = Record<string, unknown>; const isRecord = (v: unknown): v is R => typeof v === "object" && v !== null; const records = (v: unknown): R[] => Array.isArray(v) ? v.filter(isRecord) : [];
function validSignature(header: string | null, body: string) { if (!APP_SECRET || !header) return false; const [scheme, hex] = header.split("="); if (scheme !== "sha256" || !hex) return false; const expected = createHmac("sha256", APP_SECRET).update(body).digest("hex"); try { return timingSafeEqual(Buffer.from(hex, "hex"), Buffer.from(expected, "hex")); } catch { return false; } }
function inbound(payload: unknown) { const result: { id: string; from: string; text: string; phoneId: string; raw: R }[] = []; if (!isRecord(payload)) return result; for (const entry of records(payload.entry)) for (const change of records(entry.changes)) { const value = isRecord(change.value) ? change.value : null; const metadata = value && isRecord(value.metadata) ? value.metadata : null; const phoneId = typeof metadata?.phone_number_id === "string" ? metadata.phone_number_id : ""; for (const msg of records(value?.messages)) { const text = isRecord(msg.text) && typeof msg.text.body === "string" ? msg.text.body : ""; if (typeof msg.id === "string" && typeof msg.from === "string" && phoneId) result.push({ id: msg.id, from: msg.from, text, phoneId, raw: msg }); } } return result; }
export async function GET(request: NextRequest) { const p = request.nextUrl.searchParams; if (p.get("hub.mode") === "subscribe" && p.get("hub.verify_token") === VERIFY_TOKEN && p.get("hub.challenge")) return new NextResponse(p.get("hub.challenge"), { status: 200 }); return NextResponse.json({ error: "Forbidden." }, { status: 403 }); }
export async function POST(request: NextRequest) {
  const raw = await request.text(); if (!validSignature(request.headers.get("x-hub-signature-256"), raw)) return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  let payload: unknown; try { payload = JSON.parse(raw); } catch { return NextResponse.json({ error: "Malformed payload." }, { status: 400 }); }
  const messages = inbound(payload); if (messages.some((item) => item.text.length > MAX_MESSAGE_LENGTH)) return NextResponse.json({ error: `WhatsApp messages must be ${MAX_MESSAGE_LENGTH} characters or fewer.` }, { status: 400 });
  const client = createServiceRoleClient(); const ip = getRequestIp(request);
  try {
    for (const item of messages) {
      const limits = await Promise.all([checkRateLimit(client, `wa:${item.from}`, 20), checkRateLimit(client, `wa-ip:${ip}`, 120), checkRateLimit(client, "wa-global", 2000)]); const rejected = limits.find((x) => !x.allowed); if (rejected) return NextResponse.json({ error: "Too many messages." }, { status: rejected.error ? 503 : 429, headers: { "Retry-After": String(rejected.retryAfterSeconds ?? 60) } });
      const queued = await enqueueInboundMessage(client, item.id, item.phoneId, item.raw); if (queued.status === "done" || !(await claimInboundMessage(client, queued.id))) continue;
      const business = await client.from("businesses").select("id").eq("whatsapp_phone_number_id", item.phoneId).eq("is_active", true).maybeSingle(); if (business.error) throw business.error; if (!business.data) { await markInboundDone(client, queued.id); continue; }
      const businessId = business.data.id;
      try { const result = await withConversationLease(client, `wa:${businessId}:${item.from}`, () => processMessage(businessId, `wa_${item.from}`, item.text, "whatsapp")); await sendWhatsappReply(item.phoneId, item.from, result.reply); await markInboundDone(client, queued.id); } catch (error) { await markInboundFailed(client, queued.id, error instanceof Error ? error.message : "processing failed"); throw error; }
    }
    return NextResponse.json({ status: "received" }, { status: 200 });
  } catch (error) { console.error("WhatsApp inbound processing failed after durable enqueue:", error); return NextResponse.json({ error: "Temporary processing failure." }, { status: 500 }); }
}
