import "server-only";
import { sendEmailWithResend } from "@/lib/email/resend";
import { sendAlertCore, type Alert, type AlertDeps, type AlertResult } from "./core";
import { runAlertSweep } from "./sweep";

type Client = Parameters<typeof runAlertSweep>[0];

/** Real dependencies: ALERT_EMAIL_TO is the operator's address; mail goes out through Resend. */
export function alertDeps(): AlertDeps {
  return {
    to: process.env.ALERT_EMAIL_TO?.trim() || undefined,
    send: (to, subject, html) => sendEmailWithResend({ to, subject, html }),
  };
}

export function sendAlert(client: Client, alert: Alert): Promise<AlertResult> {
  return sendAlertCore(client, alert, alertDeps());
}

export function sweepAndAlert(client: Client) {
  return runAlertSweep(client, alertDeps());
}
