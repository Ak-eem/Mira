import "server-only";
import { processIncomingMessage } from "@/lib/chat/processIncomingMessage";
import { withConversationLease } from "@/lib/chat/durable";
import type { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  markInboundDone,
  markInboundFailed,
  markInboundSent,
  saveInboundReply,
  decideSend,
  markSendStarted,
  markSendRejected,
  markSendAbandoned,
  type QueueRow,
} from "@/lib/whatsapp/inboundQueue";
import { sendWhatsappReplyDetailed } from "@/lib/whatsapp/sendMessage";

type Client = ReturnType<typeof createServiceRoleClient>;
export type WhatsappItem = { id: string; from: string; text: string; phoneId: string };

/**
 * Everything that happens to one claimed inbound WhatsApp message: find the business, run the AI pipeline
 * (once), persist the reply, send it, record the send. Shared by the Meta webhook and the admin retry button.
 * On failure the row is marked failed and the error is rethrown.
 */
export async function processWhatsappQueued(client: Client, queued: QueueRow, item: WhatsappItem): Promise<void> {
  const business = await client
    .from("businesses")
    .select("id")
    .eq("whatsapp_phone_number_id", item.phoneId)
    .eq("is_active", true)
    .maybeSingle();
  if (business.error) throw business.error;
  if (!business.data) {
    await markInboundDone(client, queued.id);
    return;
  }

  const businessId = business.data.id;
  try {
    if (queued.reply_sent_at) {
      // Sent on an earlier attempt; only the final ack was lost.
      await markInboundDone(client, queued.id);
      return;
    }

    // Outbox: a reply persisted by an earlier attempt is re-sent as-is.
    // Otherwise process (idempotent on the inbound key), persist the
    // reply, THEN send, so a crash after the send can never regenerate
    // the answer or duplicate the stored rows.
    let replyText = queued.reply_text;
    if (replyText === null) {
      const result = await withConversationLease(client, `wa:${businessId}:${item.from}`, () =>
        processIncomingMessage(client, businessId, `wa_${item.from}`, item.text, "whatsapp", `wa:${item.id}`),
      );
      if (result.silent) {
        await markInboundDone(client, queued.id);
        return;
      }
      replyText = result.reply;
      await saveInboundReply(client, queued.id, replyText);
    }

    const gate = decideSend(queued);
    if (gate.action === "abandon") {
      console.error(`WhatsApp reply for queue row ${queued.id} has an unconfirmed delivery after its one re-send; closing without another send.`);
      await markSendAbandoned(client, queued.id);
      return;
    }
    await markSendStarted(client, queued.id, gate.resend);
    const sent = await sendWhatsappReplyDetailed(item.phoneId, item.from, replyText);
    if (sent.outcome === "rejected") {
      // Definitely not delivered, so the retry starts clean.
      await markSendRejected(client, queued.id);
      throw new Error("WhatsApp rejected the reply.");
    }
    // "unknown" leaves send_started_at set: the next attempt treats it as
    // ambiguous and re-sends at most once.
    if (sent.outcome === "unknown") throw new Error("WhatsApp send outcome unknown.");
    await markInboundSent(client, queued.id, sent.messageId);
  } catch (error) {
    await markInboundFailed(
      client,
      queued.id,
      error instanceof Error ? error.message : "processing failed",
    );
    throw error;
  }
}
