import "server-only";

type VerificationTemplateInput = {
  otp: string;
  expiresInMinutes?: number;
};

type WelcomeTemplateInput = {
  recipientName?: string;
  loginUrl?: string;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const baseFont = "-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif";
const accent = "#5b4bdb";
const ink = "#172033";
const muted = "#667085";
const panel = "#f7f8fc";

export function renderVerificationOtpEmail({
  otp,
  expiresInMinutes = 10,
}: VerificationTemplateInput): { subject: string; html: string } {
  const safeOtp = escapeHtml(otp);
  const safeExpiry = escapeHtml(String(expiresInMinutes));

  return {
    subject: "Your Mira verification code",
    html: `<!doctype html>
<html lang="en">
  <body style="margin:0;background-color:${panel};font-family:${baseFont};color:${ink};">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;background-color:${panel};">
      <tr><td align="center" style="padding:40px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;max-width:560px;border-collapse:collapse;background-color:#ffffff;border:1px solid #e6e8ef;border-radius:16px;">
          <tr><td style="padding:32px 32px 12px;text-align:center;">
            <div style="font-size:20px;font-weight:700;letter-spacing:-0.02em;">Mira <span style="font-weight:400;color:${accent};">for Business</span></div>
          </td></tr>
          <tr><td style="padding:12px 32px 32px;text-align:center;">
            <h1 style="margin:0;font-size:24px;line-height:32px;font-weight:700;">Verify your email</h1>
            <p style="margin:14px 0 0;font-size:15px;line-height:24px;color:${muted};">Enter this one-time code to finish setting up your Mira account.</p>
            <div style="margin:28px 0;padding:18px 16px;background-color:${panel};border-radius:12px;color:${accent};font-size:36px;line-height:44px;font-weight:700;letter-spacing:0.24em;">${safeOtp}</div>
            <p style="margin:0;font-size:13px;line-height:20px;color:${muted};">This code expires in ${safeExpiry} minutes and can only be used once.</p>
            <p style="margin:24px 0 0;font-size:13px;line-height:20px;color:${muted};">If you did not request this email, you can safely ignore it.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`,
  };
}

export function renderWelcomeEmail({
  recipientName,
  loginUrl,
}: WelcomeTemplateInput): { subject: string; html: string } {
  const greeting = recipientName ? `Hi ${escapeHtml(recipientName)},` : "Welcome,";
  const safeLoginUrl = loginUrl ? escapeHtml(loginUrl) : null;
  const loginBlock = safeLoginUrl
    ? `<a href="${safeLoginUrl}" style="display:inline-block;padding:12px 20px;border-radius:8px;background-color:${accent};color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;">Open Mira</a>`
    : "";

  return {
    subject: "Welcome to Mira for Business",
    html: `<!doctype html>
<html lang="en">
  <body style="margin:0;background-color:${panel};font-family:${baseFont};color:${ink};">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;background-color:${panel};">
      <tr><td align="center" style="padding:40px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;max-width:560px;border-collapse:collapse;background-color:#ffffff;border:1px solid #e6e8ef;border-radius:16px;">
          <tr><td style="padding:32px 32px 12px;text-align:center;">
            <div style="font-size:20px;font-weight:700;letter-spacing:-0.02em;">Mira <span style="font-weight:400;color:${accent};">for Business</span></div>
          </td></tr>
          <tr><td style="padding:12px 32px 36px;text-align:center;">
            <h1 style="margin:0;font-size:24px;line-height:32px;font-weight:700;">Welcome to Mira</h1>
            <p style="margin:20px 0 0;text-align:left;font-size:15px;line-height:24px;color:${ink};">${greeting}</p>
            <p style="margin:12px 0 0;text-align:left;font-size:15px;line-height:24px;color:${muted};">Your email is verified and your Mira for Business account is ready. We are glad to have you here.</p>
            ${loginBlock ? `<div style="margin-top:28px;text-align:center;">${loginBlock}</div>` : ""}
            <p style="margin:28px 0 0;font-size:13px;line-height:20px;color:${muted};">You can reply to this email if you need help.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`,
  };
}
