const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const WHATSAPP_TEXT_LIMIT = 4096;

export function convertMarkdownForWhatsapp(text: string): string {
  return text.replace(/\*\*([^\n]+?)\*\*/g, "*$1*");
}

export function clipToWhatsappLimit(text: string): string {
  if (text.length <= WHATSAPP_TEXT_LIMIT) return text;
  return text.slice(0, WHATSAPP_TEXT_LIMIT - 1) + "…";
}

const SEND_TIMEOUT_MS = 15_000;

/**
 * "sent"     Meta accepted the message.
 * "rejected" Meta answered with an error, or we never sent: definitely NOT
 *            delivered, so retrying can't duplicate it.
 * "unknown"  Timeout or network error mid-request: Meta may or may not have
 *            accepted it. The Cloud API has no send idempotency key, so this
 *            is the one outcome a caller must not blindly retry forever.
 */
export type WhatsappSendOutcome =
  | { outcome: "sent"; messageId: string | null }
  | { outcome: "rejected" }
  | { outcome: "unknown" };

// Free-form text reply within the 24-hour customer service window --
// distinct from sendWhatsAppTemplate (lib/nudges/sendTemplate.ts), which
// is for business-initiated sends outside that window and requires a
// pre-approved template.
export async function sendWhatsappReplyDetailed(
  phoneNumberId: string,
  to: string,
  body: string,
): Promise<WhatsappSendOutcome> {
  if (!WHATSAPP_TOKEN) {
    console.error("WHATSAPP_TOKEN is not configured.");
    return { outcome: "rejected" };
  }

  let response: Response;
  try {
    response = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        text: { body: clipToWhatsappLimit(convertMarkdownForWhatsapp(body)) },
      }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
  } catch (error) {
    console.error("WhatsApp send exception (outcome unknown):", error);
    return { outcome: "unknown" };
  }

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    console.error("WhatsApp send failed:", response.status, details);
    // 5xx can in principle mean "accepted, then errored"; Meta documents
    // 4xx as request rejected. Treat only 4xx as definitive.
    return { outcome: response.status >= 500 ? "unknown" : "rejected" };
  }

  try {
    const json = (await response.json()) as { messages?: { id?: string }[] };
    return { outcome: "sent", messageId: json.messages?.[0]?.id ?? null };
  } catch {
    // Accepted (2xx) but the body was unreadable: still sent.
    return { outcome: "sent", messageId: null };
  }
}

// Boolean wrapper kept for callers that don't need the distinction (the
// admin operator-reply endpoint).
export async function sendWhatsappReply(phoneNumberId: string, to: string, body: string) {
  return (await sendWhatsappReplyDetailed(phoneNumberId, to, body)).outcome === "sent";
}
