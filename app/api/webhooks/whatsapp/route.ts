import { NextRequest, NextResponse, after } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { processMessage } from "@/lib/chat/processMessage";
import { checkRateLimit } from "@/lib/rateLimit";
import { createHmac, timingSafeEqual } from "crypto";

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const WHATSAPP_WEBHOOK_VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
const WHATSAPP_APP_SECRET = process.env.WHATSAPP_APP_SECRET;

// Cloud API hard-rejects text['body'] over 4096 characters. MAX_OUTPUT_TOKENS
// in generateReply.ts (2048) can produce a reply past that on a verbose
// answer, so clip rather than let the send fail silently.
const WHATSAPP_TEXT_LIMIT = 4096;

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

function clipToWhatsappLimit(text: string): string {
  if (text.length <= WHATSAPP_TEXT_LIMIT) return text;
  return text.slice(0, WHATSAPP_TEXT_LIMIT - 1) + "…";
}

async function sendWhatsappReply(phoneNumberId: string, to: string, body: string) {
  if (!WHATSAPP_TOKEN) {
    console.error("WHATSAPP_TOKEN is not configured.");
    return;
  }

  try {
    const response = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        text: { body: clipToWhatsappLimit(body) },
      }),
    });

    if (!response.ok) {
      const details = await response.text();
      console.error("WhatsApp send failed:", response.status, details);
    }
  } catch (error) {
    console.error("WhatsApp send exception:", error);
  }
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
