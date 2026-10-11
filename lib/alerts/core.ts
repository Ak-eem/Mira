// Operator alerts by email. No imports from Next/Resend here so it can be unit-tested;
// lib/alerts/index.ts binds the real email sender and environment.
//
// Cooldown: an alert key is sent at most once per cooldown window. The last-sent time is kept in
// system_health_checks (check_name = "alert:<key>"), so it survives restarts and serverless cold
// starts. Alerts never throw: a broken alert path must not break message handling.

type AlertClient = {
  from: (table: string) => any;  
};

export type Alert = {
  key: string;
  subject: string;
  lines: string[];
  /** Minimum minutes between two sends of the same key. Default 360 (6 hours). */
  cooldownMinutes?: number;
};

export type AlertDeps = {
  to: string | undefined;
  send: (to: string, subject: string, html: string) => Promise<unknown>;
  now?: () => Date;
};

export type AlertResult = "sent" | "suppressed" | "not_configured" | "failed";

const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function renderAlertHtml(alert: Alert): string {
  const items = alert.lines.map((line) => `<li>${escape(line)}</li>`).join("");
  return `<div style="font-family:system-ui,sans-serif;font-size:14px;color:#0f172a"><p><strong>${escape(alert.subject)}</strong></p><ul>${items}</ul><p style="color:#64748b;font-size:12px">Sent by Mira. The same alert is not repeated for ${Math.round((alert.cooldownMinutes ?? 360) / 60)} hour(s).</p></div>`;
}

export async function sendAlertCore(client: AlertClient, alert: Alert, deps: AlertDeps): Promise<AlertResult> {
  try {
    if (!deps.to) {
      console.error(`[alert not sent: ALERT_EMAIL_TO is not set] ${alert.subject}`);
      return "not_configured";
    }
    const now = (deps.now ?? (() => new Date()))();
    const checkName = `alert:${alert.key}`;
    const cooldownMs = (alert.cooldownMinutes ?? 360) * 60_000;

    const { data: last } = await client.from("system_health_checks").select("checked_at").eq("check_name", checkName).maybeSingle();
    if (last?.checked_at && now.getTime() - new Date(last.checked_at).getTime() < cooldownMs) return "suppressed";

    await deps.send(deps.to, `[Mira] ${alert.subject}`, renderAlertHtml(alert));
    // Stamp only after a successful send, so a failed send is retried on the next occurrence.
    const { error } = await client.from("system_health_checks").upsert({ check_name: checkName, checked_at: now.toISOString() });
    if (error) console.error("Could not record alert cooldown:", error);
    return "sent";
  } catch (error) {
    console.error("sendAlert failed:", error);
    return "failed";
  }
}
