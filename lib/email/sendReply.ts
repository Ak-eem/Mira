import "server-only";
import { Resend } from "resend";

export async function sendEmailReply(
  to: string,
  from: string,
  subject: string,
  body: string,
  inReplyTo?: string,
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !from) {
    console.error("RESEND_API_KEY or sender address is not configured.");
    return false;
  }

  try {
    const headers = inReplyTo
      ? { "In-Reply-To": inReplyTo, References: inReplyTo }
      : undefined;
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from,
      to: [to],
      subject: subject.startsWith("Re:") ? subject : `Re: ${subject}`,
      text: body,
      headers,
    });
    if (error) {
      console.error("Email send failed:", error);
      return false;
    }
    return true;
  } catch (error) {
    console.error("Email send exception:", error);
    return false;
  }
}