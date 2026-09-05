const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const WHATSAPP_TEXT_LIMIT = 4096;

export function convertMarkdownForWhatsapp(text: string): string {
  return text.replace(/\*\*([^\n]+?)\*\*/g, "*$1*");
}

export function clipToWhatsappLimit(text: string): string {
  if (text.length <= WHATSAPP_TEXT_LIMIT) return text;
  return text.slice(0, WHATSAPP_TEXT_LIMIT - 1) + "…";
}

// Free-form text reply within the 24-hour customer service window --
// distinct from sendWhatsAppTemplate (lib/nudges/sendTemplate.ts), which
// is for business-initiated sends outside that window and requires a
// pre-approved template. Shared by the inbound webhook (AI replies) and
// the admin operator-reply endpoint (human replies).
export async function sendWhatsappReply(phoneNumberId: string, to: string, body: string) {
  if (!WHATSAPP_TOKEN) {
    console.error("WHATSAPP_TOKEN is not configured.");
    return false;
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
        text: { body: clipToWhatsappLimit(convertMarkdownForWhatsapp(body)) },
      }),
    });

    if (!response.ok) {
      const details = await response.text();
      console.error("WhatsApp send failed:", response.status, details);
      return false;
    }
    return true;
  } catch (error) {
    console.error("WhatsApp send exception:", error);
    return false;
  }
}
