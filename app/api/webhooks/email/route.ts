import { NextRequest, NextResponse } from "next/server";
import { Resend, type WebhookEventPayload } from "resend";
import { processMessage } from "@/lib/chat/processMessage";
import { processIncomingMessage } from "@/lib/chat/processIncomingMessage";
import { withConversationLease } from "@/lib/chat/durable";
import { checkRateLimit } from "@/lib/rateLimit";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  enqueueInboundMessage,
  claimInboundMessage,
  markInboundDone,
  markInboundFailed,
} from "@/lib/email/inboundQueue";
import { extractReplyText } from "@/lib/email/parseInbound";
import { sendEmailReply } from "@/lib/email/sendReply";

export const runtime = "nodejs";
const MAX_MESSAGE_LENGTH = 4000;
type Client = ReturnType<typeof createServiceRoleClient>;

function isReceivedEvent(payload: WebhookEventPayload): payload is Extract<WebhookEventPayload, { type: "email.received" }> {
  return payload.type === "email.received";
}

async function captureForHuman(client: Client, businessId: string, sender: string, message: string) {
  const sessionToken = `email_${sender}`;
  const conversation = await client
    .from("conversations")
    .select("id")
    .eq("business_id", businessId)
    .eq("session_token", sessionToken)
    .eq("status", "open")
    .maybeSingle();
  if (conversation.error) throw conversation.error;

  let conversationId = conversation.data?.id;
  if (!conversationId) {
    const created = await client
      .from("conversations")
      .insert({
        business_id: businessId,
        session_token: sessionToken,
        channel: "email",
        needs_human: true,
        last_message_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (created.error || !created.data) throw created.error ?? new Error("Could not start email conversation.");
    conversationId = created.data.id;
  }

  const saved = await client.from("messages").insert({
    conversation_id: conversationId,
    business_id: businessId,
    role: "customer",
    content: message,
  });
  if (saved.error) throw saved.error;

  const updated = await client
    .from("conversations")
    .update({ needs_human: true, last_message_at: new Date().toISOString() })
    .eq("id", conversationId);
  if (updated.error) throw updated.error;
}

export async function POST(request: NextRequest) {
  const raw = await request.text();
  const apiKey = process.env.RESEND_API_KEY;
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  if (!apiKey || !webhookSecret) {
    console.error("Resend webhook configuration is missing.");
    return NextResponse.json({ error: "Webhook unavailable." }, { status: 503 });
  }

  let event: WebhookEventPayload;
  try {
    const resend = new Resend(apiKey);
    event = resend.webhooks.verify({
      payload: raw,
      headers: {
        id: request.headers.get("svix-id") ?? "",
        timestamp: request.headers.get("svix-timestamp") ?? "",
        signature: request.headers.get("svix-signature") ?? "",
      },
      webhookSecret,
    });
  } catch {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
  }

  if (!isReceivedEvent(event)) return NextResponse.json({ status: "ignored" }, { status: 200 });
  const item = event.data;
  const sender = item.from.trim().toLowerCase();
  const toAddress = item.to[0]?.trim().toLowerCase() ?? "";
  if (!sender || !toAddress || !item.email_id) return NextResponse.json({ error: "Incomplete email event." }, { status: 400 });

  const client = createServiceRoleClient();
  const limits = await Promise.all([
    checkRateLimit(client, `email:${sender}`, 20),
    checkRateLimit(client, "email-global", 2000),
  ]);
  const rejected = limits.find((result) => !result.allowed);
  if (rejected) {
    return NextResponse.json(
      { error: "Too many messages." },
      { status: rejected.error ? 503 : 429, headers: { "Retry-After": String(rejected.retryAfterSeconds ?? 60) } },
    );
  }

  let queueId: string | null = null;
  try {
    const queued = await enqueueInboundMessage(client, item.email_id, toAddress, event);
    queueId = queued.id;
    if (queued.status === "done" || !(await claimInboundMessage(client, queued.id))) {
      return NextResponse.json({ status: "received" }, { status: 200 });
    }

    const business = await client
      .from("businesses")
      .select("id,email_responses_enabled")
      .ilike("email_inbound_address", toAddress)
      .maybeSingle();
    if (business.error) throw business.error;
    if (!business.data) {
      await markInboundFailed(client, queued.id, "No business is configured for this inbound address.");
      return NextResponse.json({ status: "received" }, { status: 200 });
    }
    const routedBusiness = business.data;

    const resend = new Resend(apiKey);
    const received = await resend.emails.receiving.get(item.email_id);
    if (received.error || !received.data) throw received.error ?? new Error("Could not retrieve received email.");
    const body = extractReplyText(received.data.text ?? "", received.data.html ?? undefined);
    if (!body) {
      await markInboundDone(client, queued.id);
      return NextResponse.json({ status: "received" }, { status: 200 });
    }
    if (body.length > MAX_MESSAGE_LENGTH) throw new Error(`Email messages must be ${MAX_MESSAGE_LENGTH} characters or fewer.`);

    const processIncoming = async () => {
      if (!routedBusiness.email_responses_enabled) {
        await captureForHuman(client, routedBusiness.id, sender, body);
        return { reply: "", silent: true };
      }
      return processIncomingMessage(client, routedBusiness.id, `email_${sender}`, body, "email");
    };
    const result = await withConversationLease(client, `email:${routedBusiness.id}:${sender}`, processIncoming);
    if (!result.silent) {
      const sent = await sendEmailReply(
        sender,
        process.env.RESEND_FROM_EMAIL ?? "",
        item.subject,
        result.reply,
        item.message_id,
      );
      if (!sent) throw new Error("Could not send email reply.");
    }
    await markInboundDone(client, queued.id);
    return NextResponse.json({ status: "received" }, { status: 200 });
  } catch (error) {
    if (queueId) {
      await markInboundFailed(client, queueId, error instanceof Error ? error.message : "processing failed");
    }
    console.error("Email inbound processing failed after durable enqueue:", error);
    return NextResponse.json({ error: "Temporary processing failure." }, { status: 500 });
  }
}