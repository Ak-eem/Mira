export type InboundItem = { id: string; from: string; text: string; phoneId: string };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

// Rebuilds the message from what the webhook stored (the raw WhatsApp message plus the
// number it arrived on), so a stuck row can be processed without the original request.
export function itemFromQueueRow(row: { message_id: string; waba_phone_number_id: string; payload: unknown }): InboundItem | null {
  const payload = row.payload;
  if (!isRecord(payload) || typeof payload.from !== "string" || !payload.from) return null;
  const text = isRecord(payload.text) && typeof payload.text.body === "string" ? payload.text.body : "";
  return { id: row.message_id, from: payload.from, text, phoneId: row.waba_phone_number_id };
}
