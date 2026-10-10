import "server-only";
import { Resend } from "resend";
import { processIncomingMessage } from "@/lib/chat/processIncomingMessage";
import { isBusinessSwitchedOff } from "@/lib/chat/businessStatus";
import { withConversationLease } from "@/lib/chat/durable";
import type { createServiceRoleClient } from "@/lib/supabase/service-role";
import { markInboundDone, markInboundFailed, markInboundSent, saveInboundReply, type QueueRow } from "@/lib/email/inboundQueue";
import { extractReplyText } from "@/lib/email/parseInbound";
import { sendEmailReply } from "@/lib/email/sendReply";

export const MAX_EMAIL_MESSAGE_LENGTH = 4000;
type Client = ReturnType<typeof createServiceRoleClient>;

async function captureForHuman(client: Client, businessId: string, sender: string, message: string, inboundKey: string) {
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
    if (created.data) {
      conversationId = created.data.id;
    } else if (created.error?.code === "23505") {
      // A concurrent delivery opened the conversation first (one open
      // conversation per session, migration 0009). Not an error: use theirs.
      const winner = await client
        .from("conversations")
        .select("id")
        .eq("business_id", businessId)
        .eq("session_token", sessionToken)
        .eq("status", "open")
        .maybeSingle();
      if (winner.error || !winner.data) throw winner.error ?? new Error("Could not start email conversation.");
      conversationId = winner.data.id;
    } else {
      throw created.error ?? new Error("Could not start email conversation.");
    }
  }

  const saved = await client.from("messages").insert({
    conversation_id: conversationId,
    business_id: businessId,
    role: "customer",
    content: message,
    inbound_key: inboundKey,
  });
  // 23505 on inbound_key: an earlier attempt already saved this email.
  if (saved.error && saved.error.code !== "23505") throw saved.error;

  const updated = await client
    .from("conversations")
    .update({ needs_human: true, last_message_at: new Date().toISOString() })
    .eq("id", conversationId);
  if (updated.error) throw updated.error;
}


export type EmailQueuedArgs = { emailId: string; sender: string; toAddress: string; subject: string; messageId?: string };

/**
 * Everything that happens to one claimed inbound email: find the business, run the AI pipeline (once),
 * persist the reply, send it, record the send. Shared by the Resend webhook and the admin retry button.
 * Throws on failure; the caller decides how to record that (markInboundFailed) and what to answer.
 */
export async function processEmailQueued(client: Client, queued: Pick<QueueRow, "id" | "reply_text" | "reply_sent_at">, args: EmailQueuedArgs): Promise<void> {
  const { sender, toAddress } = args;
  if (queued.reply_sent_at) {
    // Sent on an earlier attempt; only the final ack was lost.
    await markInboundDone(client, queued.id);
    return;
  }

  const business = await client
    .from("businesses")
    .select("id,email_responses_enabled")
    .eq("email_inbound_address", toAddress) // column is constrained lowercase (migration 0040); ilike would treat "_" as a wildcard
    .maybeSingle();
  if (business.error) throw business.error;
  if (!business.data) {
    await markInboundFailed(client, queued.id, "No business is configured for this inbound address.");
    return;
  }
  const routedBusiness = business.data;

  // Outbox: a reply persisted by an earlier attempt is re-sent as-is, with
  // no re-fetch of the email and no second trip through the AI pipeline.
  let replyText = queued.reply_text;
  if (replyText === null) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error("Resend email configuration is missing");
    const resend = new Resend(apiKey);
    const received = await resend.emails.receiving.get(args.emailId);
    if (received.error || !received.data) throw received.error ?? new Error("Could not retrieve received email.");
    const body = extractReplyText(received.data.text ?? "", received.data.html ?? undefined);
    if (!body) {
      await markInboundDone(client, queued.id);
      return;
    }
    if (body.length > MAX_EMAIL_MESSAGE_LENGTH) throw new Error(`Email messages must be ${MAX_EMAIL_MESSAGE_LENGTH} characters or fewer.`);

    const inboundKey = `email:${args.emailId}`;
    const processIncoming = async () => {
      // Cancelled / expired / unsubscribed businesses are switched off on every
      // channel, including the human inbox: nothing stored, queue row closed.
      if (await isBusinessSwitchedOff(client, routedBusiness.id)) {
        return { reply: "", silent: true };
      }
      if (!routedBusiness.email_responses_enabled) {
        await captureForHuman(client, routedBusiness.id, sender, body, inboundKey);
        return { reply: "", silent: true };
      }
      return processIncomingMessage(client, routedBusiness.id, `email_${sender}`, body, "email", inboundKey);
    };
    const result = await withConversationLease(client, `email:${routedBusiness.id}:${sender}`, processIncoming);
    if (result.silent) {
      await markInboundDone(client, queued.id);
      return;
    }
    replyText = result.reply;
    await saveInboundReply(client, queued.id, replyText);
  }

  const sent = await sendEmailReply(
    sender,
    process.env.RESEND_FROM_EMAIL ?? "",
    args.subject,
    replyText,
    args.messageId,
    `mira-reply-${queued.id}`,
  );
  if (!sent) throw new Error("Could not send email reply.");
  await markInboundSent(client, queued.id);
}
