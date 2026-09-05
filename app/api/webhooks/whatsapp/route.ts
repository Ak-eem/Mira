import { NextRequest, NextResponse, after } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { processMessage } from "@/lib/chat/processMessage";
import { checkRateLimit } from "@/lib/rateLimit";
import { createHmac, timingSafeEqual } from "crypto";
import { isOptOutMessage } from "@/lib/nudges/optOut";
import { sendWhatsappReply } from "@/lib/whatsapp/sendMessage";

const WHATSAPP_WEBHOOK_VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
const WHATSAPP_APP_SECRET = process.env.WHATSAPP_APP_SECRET;


// Uses Node's crypto module (createHmac/timingSafeEqual), so pin this route
// to the Node runtime rather than Edge.
export const runtime = "nodejs";

function verifySignature(signatureHeader: string | null, body: string): boolean {
  if (!WHATSAPP_APP_SECRET || !signatureHeader) {
    return false;
  }
  const [scheme, signature] = signatureHeader.split("=");
  if (scheme !== "sha256" || !signature) {
    return false;
  }

  const expected = createHmac("sha256", WHATSAPP_APP_SECRET).update(body).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

// Every business can have its own whatsapp_phone_number_id (see migration
// 0007) -- this is now the ONLY thing that decides which business a
// message belongs to. No global "the" phone number anymore.
async function getBusinessIdForPhoneNumberId(phoneNumberId: string) {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("businesses")
    .select("id")
    .eq("whatsapp_phone_number_id", phoneNumberId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    console.error("WhatsApp business lookup failed:", error);
    return null;
  }

  return data?.id ?? null;
}

// True if this is the first time we've seen this message id (i.e. the
// caller should go ahead and process it). Named and returns this way
// on purpose -- an earlier version named this "alreadyProcessed" for a
// value that actually meant the opposite, which reads fine right up
// until someone "fixes" the polarity and breaks it for real.
async function isNewMessage(
  supabase: ReturnType<typeof createServiceRoleClient>,
  messageId: string,
  phoneNumberId: string
): Promise<boolean> {
  const { error } = await supabase.from("whatsapp_processed_messages").insert({
    message_id: messageId,
    waba_phone_number_id: phoneNumberId,
  });

  if (!error) return true; // first time seeing this id
  if (error.code === "23505") return false; // unique_violation -> duplicate delivery

  console.error("Failed to record WhatsApp processed message:", error);
  return false; // unexpected DB error: don't process, matches prior behavior
}

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("hub.mode");
  const token = request.nextUrl.searchParams.get("hub.verify_token");
  const challenge = request.nextUrl.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === WHATSAPP_WEBHOOK_VERIFY_TOKEN && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "Forbidden." }, { status: 403 });
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signatureHeader = request.headers.get("x-hub-signature-256");

  if (!verifySignature(signatureHeader, rawBody)) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch (err) {
    console.error("WhatsApp webhook JSON parse failed:", err);
    return NextResponse.json({ error: "Malformed payload." }, { status: 400 });
  }

  // Ack Meta immediately. The real work -- dedupe, processMessage (DB +
  // Groq/Gemini with its own retry+fallback, worst case ~30s), and the
  // outbound send -- happens after the response is flushed so we're never
  // racing WhatsApp's delivery timeout with an LLM call in the critical path.
  after(() => handleEntries(payload));

  return NextResponse.json({ status: "received" }, { status: 200 });
}

async function handleEntries(payload: unknown) {
  const entries = isRecord(payload) && Array.isArray(payload.entry) ? payload.entry : [];
  const supabase = createServiceRoleClient();

  for (const entry of entries) {
    const changes = isRecord(entry) && Array.isArray(entry.changes) ? entry.changes : [];
    for (const change of changes) {
      const value = isRecord(change) ? change.value : undefined;
      if (!isRecord(value)) continue;

      const metadata = isRecord(value.metadata) ? value.metadata : undefined;
      const phoneNumberId = typeof metadata?.phone_number_id === "string" ? metadata.phone_number_id : undefined;
      if (!phoneNumberId) continue;

      const businessId = await getBusinessIdForPhoneNumberId(phoneNumberId);
      if (!businessId) {
        console.error("WhatsApp phone number id not mapped to a business:", phoneNumberId);
        continue;
      }

      const messages = Array.isArray(value.messages) ? value.messages : [];
      for (const message of messages) {
        try {
          await handleSingleMessage(supabase, businessId, phoneNumberId, message);
        } catch (err) {
          console.error("WhatsApp message handling failed:", err);
        }
      }

      // Meta delivers delivery/read receipts for messages a business
      // SENT (Nudges) in the same webhook shape as inbound messages,
      // just under `statuses` instead of `messages`. Only ever relevant
      // to nudge_sends -- ordinary reactive replies aren't tracked this
      // granularly.
      const statuses = Array.isArray(value.statuses) ? value.statuses : [];
      for (const status of statuses) {
        try {
          await handleStatusUpdate(supabase, status);
        } catch (err) {
          console.error("WhatsApp status update handling failed:", err);
        }
      }
    }
  }
}

async function handleSingleMessage(
  supabase: ReturnType<typeof createServiceRoleClient>,
  businessId: string,
  phoneNumberId: string,
  message: unknown,
) {
  if (!isRecord(message)) return;

  const messageId = typeof message.id === "string" ? message.id : undefined;
  const from = typeof message.from === "string" ? message.from : undefined;
  const text = isRecord(message.text) ? message.text.body : undefined;
  const textBody = typeof text === "string" ? text : undefined;

  if (!messageId || !from) return;

  const rateLimit = checkRateLimit(`wa_${from}`);
  if (!rateLimit.allowed) {
    await sendWhatsappReply(phoneNumberId, from, "You're sending messages a bit fast -- give it a moment and try again.");
    return;
  }

  const freshMessage = await isNewMessage(supabase, messageId, phoneNumberId);
  if (!freshMessage) return; // duplicate delivery, already handled

  if (!textBody?.trim()) {
    await sendWhatsappReply(phoneNumberId, from, "I can only read text messages right now.");
    return;
  }

  // Opt-out is checked before anything else touches this message --
  // spec requires it respected across every rule immediately, and the
  // confirmation reply is fixed/deterministic, not something to hand to
  // the LLM.
  if (isOptOutMessage(textBody)) {
    const { error } = await supabase
      .from("nudge_opt_outs")
      .upsert({ business_id: businessId, customer_identifier: `wa_${from}` }, { onConflict: "business_id,customer_identifier" });
    if (error) console.error("Failed to record nudge opt-out:", error);

    await sendWhatsappReply(
      phoneNumberId,
      from,
      "You're unsubscribed from update messages. You can still message us here any time -- this only stops proactive alerts.",
    );
    return;
  }

  // "Replied" analytics for Nudges: this inbound message counts as a
  // reply to the most recent nudge sent to this customer, if any and if
  // it hasn't already been marked. Scoped to the last 7 days so a
  // message six months after a one-off nudge doesn't get misattributed.
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recentNudge } = await supabase
    .from("nudge_sends")
    .select("id")
    .eq("business_id", businessId)
    .eq("customer_identifier", `wa_${from}`)
    .is("replied_at", null)
    .gte("sent_at", weekAgo)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (recentNudge) {
    await supabase
      .from("nudge_sends")
      .update({ replied_at: new Date().toISOString(), status: "replied" })
      .eq("id", recentNudge.id);
  }

  let replyText: string;
  try {
    const result = await processMessage(businessId, `wa_${from}`, textBody, "whatsapp");
    replyText = result.reply;
  } catch (err) {
    console.error("WhatsApp processMessage failed:", err);
    replyText = "Sorry, something went wrong on our end -- please try again in a moment.";
  }

  await sendWhatsappReply(phoneNumberId, from, replyText);
}

// Meta's status payload: { id: "<outbound wamid>", status: "sent" |
// "delivered" | "read" | "failed", timestamp, recipient_id, ... }. Only
// ever matches a row here if that wamid was one of ours from
// sendWhatsAppTemplate (see lib/nudges/sendTemplate.ts) -- a status
// update for an ordinary reactive reply just won't find a match, which
// is fine, those aren't tracked.
async function handleStatusUpdate(
  supabase: ReturnType<typeof createServiceRoleClient>,
  status: unknown,
) {
  if (!isRecord(status)) return;

  const wamid = typeof status.id === "string" ? status.id : undefined;
  const state = typeof status.status === "string" ? status.status : undefined;
  if (!wamid || !state) return;

  const update: Record<string, unknown> = {};
  if (state === "delivered") update.status = "delivered";
  else if (state === "read") update.status = "read";
  else if (state === "failed") update.status = "failed";
  else return; // "sent" is already the default we insert with

  if (state === "delivered") update.delivered_at = new Date().toISOString();
  if (state === "read") update.read_at = new Date().toISOString();

  const { error } = await supabase.from("nudge_sends").update(update).eq("whatsapp_message_id", wamid);
  if (error) console.error("Failed to update nudge_sends from status webhook:", error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
