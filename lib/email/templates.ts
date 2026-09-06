import "server-only";

type VerificationTemplateInput = {
  otp: string;
  email: string;
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
const accent = "#0f766e";
const accentDark = "#115e59";
const accentSoft = "#ecfdf5";
const ink = "#0f172a";
const muted = "#64748b";
const panel = "#f8fafc";
const card = "#ffffff";
const cardBorder = "#e2e8f0";

function logoMark(size = 15): string {
  return `<span style="font-family:${baseFont};font-size:${size}px;font-weight:700;letter-spacing:-0.01em;color:${ink};">Mira</span>`;
}

export function renderVerificationOtpEmail({
  otp,
  email,
  expiresInMinutes = 10,
}: VerificationTemplateInput): { subject: string; html: string } {
  const safeOtp = escapeHtml(otp);
  const safeEmail = escapeHtml(email);
  const safeExpiry = escapeHtml(String(expiresInMinutes));
  const digitCells = safeOtp
    .split("")
    .map(
      (d) => `
    <td style="padding:0 4px;">
      <div style="width:44px;height:56px;line-height:56px;text-align:center;background-color:${accentSoft};border:1px solid ${cardBorder};border-radius:8px;font-size:26px;font-weight:700;color:${accentDark};font-family:'SF Mono',SFMono-Regular,Menlo,Consolas,monospace;">${d}</div>
    </td>`,
    )
    .join("");

  return {
    subject: "Your Mira verification code",
    html: `<!doctype html>
<html lang="en">
  <body style="margin:0;background-color:${panel};font-family:${baseFont};color:${ink};">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;background-color:${panel};">
      <tr><td align="center" style="padding:48px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;max-width:460px;border-collapse:collapse;">

          <tr><td style="padding:0 4px 24px;text-align:center;">
            ${logoMark(19)}
            <p style="margin:10px 0 0;font-size:14px;line-height:21px;color:${muted};">A code to keep your business account safe.</p>
          </td></tr>

          <tr><td style="background-color:${card};border:1px solid ${cardBorder};border-radius:16px;padding:36px 32px;text-align:center;">
            <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 auto 22px;">
              <tr>${digitCells}</tr>
            </table>
            <p style="margin:0 0 18px;font-size:13px;line-height:20px;color:${muted};">Sent to <span style="color:${ink};font-weight:600;">${safeEmail}</span></p>
            <p style="margin:0;font-size:12px;line-height:19px;color:${muted};">Valid for ${safeExpiry} minutes. Never share this code with anyone.</p>
          </td></tr>

          <tr><td style="padding:22px 4px 0;text-align:center;">
            ${logoMark(12)}
            <p style="margin:6px 0 0;font-size:12px;line-height:18px;color:${muted};">Didn't request this? Ignore this email.</p>
          </td></tr>

        </table>
      </td></tr>
    </table>
  </body>
</html>`,
  };
}

const SUPPORT_EMAIL = "mirasupport03@gmail.com";
const SUPPORT_WHATSAPP_URL = "https://wa.me/2348020821800";

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
            <p style="margin:12px 0 0;text-align:left;font-size:15px;line-height:24px;color:${muted};">Your account is ready.</p>
            ${loginBlock ? `<div style="margin-top:28px;text-align:center;">${loginBlock}</div>` : ""}
          </td></tr>
          <tr><td style="padding:20px 32px 28px;border-top:1px solid #e6e8ef;text-align:center;">
            <p style="margin:0;font-size:13px;line-height:20px;color:${muted};">
              Need help? Email <a href="mailto:${SUPPORT_EMAIL}" style="color:${accent};text-decoration:none;">${SUPPORT_EMAIL}</a>
              or message us on <a href="${SUPPORT_WHATSAPP_URL}" style="color:${accent};text-decoration:none;">WhatsApp</a>.
            </p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`,
  };
}
