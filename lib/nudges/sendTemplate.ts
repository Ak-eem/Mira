const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;

// Business-initiated sends (Nudges) can't use free-form text the way
// replies to an inbound message can -- Meta requires a pre-approved
// template outside the 24-hour customer service window. Same Graph API
// endpoint the webhook's sendWhatsappReply already uses, different
// request body shape. Returns the outbound message id (needed to
// correlate delivery/read status webhooks back to a nudge_sends row) or
// null if the send failed -- callers decide what a failed send means
// for their own bookkeeping.
export async function sendWhatsAppTemplate(
  phoneNumberId: string,
  to: string,
  templateName: string,
  bodyParams: string[],
  languageCode = "en",
): Promise<string | null> {
  if (!WHATSAPP_TOKEN) {
    console.error("WHATSAPP_TOKEN is not configured.");
    return null;
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
        type: "template",
        template: {
          name: templateName,
          language: { code: languageCode },
          components:
            bodyParams.length > 0
              ? [{ type: "body", parameters: bodyParams.map((text) => ({ type: "text", text })) }]
              : [],
        },
      }),
    });

    const data = (await response.json().catch(() => null)) as { messages?: { id?: string }[] } | null;

    if (!response.ok) {
      console.error("WhatsApp template send failed:", response.status, data);
      return null;
    }

    return data?.messages?.[0]?.id ?? null;
  } catch (error) {
    console.error("WhatsApp template send exception:", error);
    return null;
  }
}
