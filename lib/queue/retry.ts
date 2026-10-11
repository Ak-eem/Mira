import "server-only";
import type { createServiceRoleClient } from "@/lib/supabase/service-role";
import { claimInboundMessage as claimWhatsapp } from "@/lib/whatsapp/inboundQueue";
import { claimInboundMessage as claimEmail } from "@/lib/email/inboundQueue";
import { processWhatsappQueued } from "@/lib/whatsapp/processQueued";
import { processEmailQueued } from "@/lib/email/processQueued";
import { buildEmailArgs, buildWhatsappItem } from "./rowPayload";

type Client = ReturnType<typeof createServiceRoleClient>;
export type RetryChannel = "whatsapp" | "email";
export type RetryResult = { ok: true } | { ok: false; reason: string };

const WA_COLUMNS = "id,status,attempts,reply_text,reply_sent_at,send_started_at,send_resent,message_id,waba_phone_number_id,payload";
const EMAIL_COLUMNS = "id,status,attempts,reply_text,reply_sent_at,resend_email_id,to_address,payload";

/**
 * Admin "retry" for a stuck inbound message. Resets the attempt counter, claims the row exactly the way the
 * webhook does, and runs the same processing code with the stored payload. Idempotent by design: a reply that
 * was already written is re-sent as-is (never regenerated), and a row that is already "done" is left alone.
 *
 * WhatsApp has no send idempotency key, so if an earlier attempt's send outcome was never recorded this can,
 * rarely, deliver the same reply twice. Email replies carry an idempotency key, so they cannot.
 */
export async function retryQueueRow(client: Client, channel: RetryChannel, id: string): Promise<RetryResult> {
  const table = channel === "whatsapp" ? "whatsapp_inbound_queue" : "email_inbound_queue";
  const found = await client.from(table).select(channel === "whatsapp" ? WA_COLUMNS : EMAIL_COLUMNS).eq("id", id).maybeSingle();
  if (found.error) return { ok: false, reason: found.error.message };
  if (!found.data) return { ok: false, reason: "That message no longer exists (it may have been purged)." };
   
  const row = found.data as any;
  if (row.status === "done") return { ok: false, reason: "Already handled - nothing to retry." };

  const reset: Record<string, unknown> = { status: "pending", attempts: 0, locked_at: null, available_at: new Date().toISOString(), last_error: null };
  // An admin asked for a re-send, so lift the "one ambiguous re-send only" lock - but never for a reply that is known to be sent.
  if (channel === "whatsapp" && !row.reply_sent_at) Object.assign(reset, { send_started_at: null, send_resent: false });
  const updated = await client.from(table).update(reset).eq("id", id).select(channel === "whatsapp" ? WA_COLUMNS : EMAIL_COLUMNS).single();
  if (updated.error || !updated.data) return { ok: false, reason: updated.error?.message ?? "Could not reset the message." };
   
  const fresh = updated.data as any;

  try {
    if (channel === "whatsapp") {
      const item = buildWhatsappItem(fresh);
      if (!item) return { ok: false, reason: "The stored message is malformed and cannot be replayed." };
      if (!(await claimWhatsapp(client, fresh))) return { ok: false, reason: "Another worker is processing this message right now. Try again in a minute." };
      await processWhatsappQueued(client, fresh, item);
    } else {
      const args = buildEmailArgs(fresh);
      if (!args) return { ok: false, reason: "The stored email is malformed and cannot be replayed." };
      if (!(await claimEmail(client, fresh))) return { ok: false, reason: "Another worker is processing this message right now. Try again in a minute." };
      try {
        await processEmailQueued(client, fresh, args);
      } catch (error) {
        // The webhook records failures in its own catch; do the same here.
        const { markInboundFailed } = await import("@/lib/email/inboundQueue");
        await markInboundFailed(client, fresh.id, error instanceof Error ? error.message : "processing failed");
        throw error;
      }
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "Processing failed again." };
  }
}
