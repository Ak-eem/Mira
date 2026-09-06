import "server-only";

type ResendEmailInput = {
  to: string;
  subject: string;
  html: string;
};

type ResendResponse = {
  id?: string;
};

export async function sendEmailWithResend({
  to,
  subject,
  html,
}: ResendEmailInput): Promise<{ id: string | null }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !from) {
    throw new Error("Resend email configuration is missing");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [to], subject, html }),
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Resend email request failed with status ${response.status}: ${detail}`);
  }

  const result = (await response.json()) as ResendResponse;
  return { id: result.id ?? null };
}
