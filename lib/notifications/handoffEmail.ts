// Wording for "a customer needs you" emails. Pure so it can be unit-tested. It deliberately carries no
// customer message text: the email says who needs attention and links to the conversation.

export type HandoffNoticeReason = "requested" | "confused" | "order" | "email";

const COPY: Record<HandoffNoticeReason, { subject: string; line: string }> = {
  requested: { subject: "A customer asked to speak to a person", line: "A customer asked to speak to a person." },
  confused: { subject: "A customer needs your help", line: "Mira could not help a customer and asked for a person to take over." },
  order: { subject: "New order waiting for your confirmation", line: "A customer placed an order in chat. It is waiting for you to confirm it." },
  email: { subject: "A customer emailed you", line: "A customer emailed your business. AI replies are switched off, so this needs a reply from you." },
};

const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function renderHandoffEmail(input: { businessName: string; reason: HandoffNoticeReason; link: string; waiting: number }): { subject: string; html: string } {
  const copy = COPY[input.reason];
  const others = input.waiting > 1 ? `<p>${input.waiting} conversations are waiting for you in total.</p>` : "";
  return {
    subject: `${input.businessName}: ${copy.subject}`,
    html: `<div style="font-family:system-ui,sans-serif;font-size:15px;color:#0f172a"><p><strong>${escape(copy.subject)}</strong></p><p>${escape(copy.line)}</p>${others}<p><a href="${escape(input.link)}">Open the conversation</a></p><p style="color:#64748b;font-size:12px">Customers who are waiting are not told anything more until you reply. To limit emails, you get at most one every 10 minutes per business.</p></div>`,
  };
}
