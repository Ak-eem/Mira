// Rebuilds what the webhook handlers had in hand from a stored queue row, so a stuck message can be
// re-run without the provider re-delivering it. Pure and defensive: a malformed payload returns null.

type R = Record<string, unknown>;
const isRecord = (value: unknown): value is R => typeof value === "object" && value !== null && !Array.isArray(value);
const str = (value: unknown): string | null => (typeof value === "string" && value.length > 0 ? value : null);

/** whatsapp_inbound_queue: payload is the raw Meta message object; message_id / waba_phone_number_id are columns. */
export function buildWhatsappItem(row: { message_id: string; waba_phone_number_id: string; payload: unknown }): { id: string; from: string; text: string; phoneId: string } | null {
  if (!isRecord(row.payload)) return null;
  const from = str(row.payload.from);
  const phoneId = str(row.waba_phone_number_id);
  const id = str(row.message_id);
  if (!from || !phoneId || !id) return null;
  const text = isRecord(row.payload.text) && typeof row.payload.text.body === "string" ? row.payload.text.body : "";
  return { id, from, text, phoneId };
}

/** email_inbound_queue: payload is the whole Resend "email.received" event; the address and email id are columns. */
export function buildEmailArgs(row: { resend_email_id: string; to_address: string; payload: unknown }): { emailId: string; sender: string; toAddress: string; subject: string; messageId?: string } | null {
  if (!isRecord(row.payload) || !isRecord(row.payload.data)) return null;
  const data = row.payload.data;
  const sender = str(data.from)?.trim().toLowerCase() ?? null;
  const emailId = str(row.resend_email_id);
  const toAddress = str(row.to_address)?.trim().toLowerCase() ?? null;
  if (!sender || !emailId || !toAddress) return null;
  const messageId = str(data.message_id) ?? undefined;
  return { emailId, sender, toAddress, subject: typeof data.subject === "string" ? data.subject : "", messageId };
}
