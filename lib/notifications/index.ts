import "server-only";
import { sendEmailWithResend } from "@/lib/email/resend";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { notifyOwnersOfHandoff } from "./notifyHandoff";
import type { HandoffNoticeReason } from "./handoffEmail";

/** Fire-and-forget from request handlers (wrap in after()). Uses the service role: owner emails live in auth. */
export function notifyHandoff(input: { businessId: string; conversationId: string; reason: HandoffNoticeReason }) {
  return notifyOwnersOfHandoff(createServiceRoleClient() as never, input, {
    send: (to, subject, html) => sendEmailWithResend({ to, subject, html }),
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "https://miraapp.com.ng",
  });
}
