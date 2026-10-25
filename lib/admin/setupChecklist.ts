// What is and is not configured on this deployment. Reads only whether each variable is set (never its value),
// so it is safe to show on the admin Settings page.

export type SetupItem = { name: string; ok: boolean; note: string; fix: string };

type Env = Record<string, string | undefined>;
const set = (env: Env, name: string) => Boolean(env[name]?.trim());

export function setupChecklist(env: Env): SetupItem[] {
  const paystack = env.PAYSTACK_SECRET_KEY?.trim();
  const items: SetupItem[] = [
    { name: "CRON_SECRET", ok: set(env, "CRON_SECRET"), note: "Without it the daily nudges and data-retention cleanup never run.", fix: "Set a long random value in Vercel (Production) and redeploy." },
    { name: "ALERT_EMAIL_TO", ok: set(env, "ALERT_EMAIL_TO"), note: "Where problem alerts (stuck messages, AI failures) are emailed.", fix: "Set to an inbox you read." },
    { name: "RESEND_API_KEY", ok: set(env, "RESEND_API_KEY"), note: "Sends verification codes, order updates, handoff and alert emails.", fix: "Create a key in Resend and set it." },
    { name: "RESEND_FROM_EMAIL", ok: set(env, "RESEND_FROM_EMAIL"), note: "The sender address on those emails (must be on a verified domain).", fix: "For example: Mira <noreply@yourdomain.com>." },
    { name: "RESEND_WEBHOOK_SECRET", ok: set(env, "RESEND_WEBHOOK_SECRET"), note: "Needed to receive customer emails.", fix: "Copy it from the Resend webhook you created." },
    { name: "EMAIL_VERIFICATION_PEPPER", ok: set(env, "EMAIL_VERIFICATION_PEPPER"), note: "Secures the 6-digit signup codes.", fix: "Set a long random value." },
    { name: "GROQ_API_KEY or LLM_API_KEY", ok: set(env, "GROQ_API_KEY") || set(env, "LLM_API_KEY"), note: "The AI that writes replies.", fix: "Set the key for the provider chosen in AI_PROVIDER." },
    { name: "WHATSAPP_TOKEN", ok: set(env, "WHATSAPP_TOKEN"), note: "Sends WhatsApp replies.", fix: "A permanent system-user token from Meta." },
    { name: "WHATSAPP_APP_SECRET", ok: set(env, "WHATSAPP_APP_SECRET"), note: "Verifies WhatsApp webhooks really come from Meta.", fix: "From the Meta app settings." },
    { name: "WHATSAPP_WEBHOOK_VERIFY_TOKEN", ok: set(env, "WHATSAPP_WEBHOOK_VERIFY_TOKEN"), note: "Lets Meta confirm your webhook URL.", fix: "Any random string; use the same one in Meta." },
    { name: "PAYSTACK_SECRET_KEY", ok: Boolean(paystack), note: paystack?.startsWith("sk_test_") ? "A TEST key is set: real payments will not be taken." : "Takes subscription payments.", fix: "Use sk_live_ for real customers." },
    { name: "NEXT_PUBLIC_SITE_URL", ok: set(env, "NEXT_PUBLIC_SITE_URL"), note: "Used for links inside emails.", fix: "For example https://miraapp.com.ng." },
  ];
  // A live-mode requirement: a test key is "set" but should be flagged.
  return items.map((item) => (item.name === "PAYSTACK_SECRET_KEY" && paystack?.startsWith("sk_test_") ? { ...item, ok: false } : item));
}
