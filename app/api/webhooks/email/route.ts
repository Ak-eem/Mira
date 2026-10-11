import { NextRequest, NextResponse } from "next/server";
import { Resend, type WebhookEventPayload } from "resend";
import { processMessage } from "@/lib/chat/processMessage";
import { checkRateLimit } from "@/lib/rateLimit";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  enqueueInboundMessage,
  claimInboundMessage,
  markInboundDone,
  markInboundFailed,
} from "@/lib/email/inboundQueue";
import { processEmailQueued } from "@/lib/email/processQueued";

export const runtime = "nodejs";
const MAX_MESSAGE_LENGTH = 4000;
type Client = ReturnType<typeof createServiceRoleClient>;

function isReceivedEvent(payload: WebhookEventPayload): payload is Extract<WebhookEventPayload, { type: "email.received" }> {
  return payload.type === "email.received";
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
  let queueId: string | null = null;
  try {
    const queued = await enqueueInboundMessage(client, item.email_id, toAddress, event);
    queueId = queued.id;
    if (queued.status === "done") return NextResponse.json({ status: "received" }, { status: 200 });

    // Dedup BEFORE the rate limit (same as the WhatsApp route): a replayed
    // copy of an already-processed email must be a free no-op, otherwise
    // replaying a captured webhook burns the sender's hourly budget. A
    // rate-limited row stays queued and is picked up when the webhook is
    // redelivered.
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

    if (!(await claimInboundMessage(client, queued))) {
      return NextResponse.json({ status: "received" }, { status: 200 });
    }

    await processEmailQueued(client, queued, {
      emailId: item.email_id,
      sender,
      toAddress,
      subject: item.subject,
      messageId: item.message_id,
    });
    return NextResponse.json({ status: "received" }, { status: 200 });
  } catch (error) {
    if (queueId) {
      await markInboundFailed(client, queueId, error instanceof Error ? error.message : "processing failed");
    }
    console.error("Email inbound processing failed after durable enqueue:", error);
    return NextResponse.json({ error: "Temporary processing failure." }, { status: 500 });
  }
}