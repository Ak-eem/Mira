import "server-only";
import { Resend } from "resend";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { planHandoffRecipients } from "./handoffRecipients";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://miraapp.com.ng";
const MAX_RECIPIENTS = 10;
const TIMEOUT_MS = 4000;

type Input = {
  businessId: string;
  conversationId: string;
  // Used as the email idempotency key so a retried delivery never sends a second email.
  dedupeKey: string;
  reason?: string | null;
};

function reasonLine(reason?: string | null): string {
  if (reason === "requested") return "The customer asked to speak to a person.";
  if (reason === "confused") return "Mira wasn't able to help with this one and handed it over.";
  if (reason === "order") return "An order is waiting for you to confirm.";
  return "A customer is waiting for a reply from you.";
}

async function send({ businessId, conversationId, dedupeKey, reason }: Input): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (process.env.HANDOFF_EMAILS_DISABLED === "true" || !apiKey || !from) return;

  const supabase = createServiceRoleClient();
  const [{ data: business }, { data: members }] = await Promise.all([
    supabase.from("businesses").select("name").eq("id", businessId).maybeSingle(),
    supabase.from("business_owners").select("user_id, role").eq("business_id", businessId).limit(50),
  ]);
  if (!business || !members?.length) return;

  // Team members first (they answer customers); the owner only if there is no team yet.
  const plan = planHandoffRecipients(members);
  const emails = new Set<string>();
  for (const userId of plan.userIds.slice(0, MAX_RECIPIENTS)) {
    const { data } = await supabase.auth.admin.getUserById(userId);
    const email = data?.user?.email;
    if (email) emails.add(email.toLowerCase());
  }
  if (emails.size === 0) return;

  const link = `${SITE_URL}/portal/${businessId}/conversations/${conversationId}`;
  const text = [
    `A customer is waiting for you on ${business.name}.`,
    "",
    reasonLine(reason),
    "Mira has stopped replying on this conversation until you take it over or hand it back.",
    "",
    `Open it: ${link}`,
    "",
    "You get this email each time a conversation needs a person.",
    ...(plan.fallbackToOwner
      ? [
          "",
          "Tip: you haven't added anyone from your customer service team yet, so this reached you.",
          `Add them under Team and these alerts will go to them instead: ${SITE_URL}/portal/${businessId}/team`,
        ]
      : []),
  ].join("\n");

  const resend = new Resend(apiKey);
  let index = 0;
  for (const to of emails) {
    const { error } = await resend.emails.send(
      { from, to: [to], subject: `A customer is waiting for you: ${business.name}`, text },
      { idempotencyKey: `handoff-${dedupeKey}-${index++}` },
    );
    if (error) console.error("Handoff email failed:", error);
  }
}

// Best-effort and time-boxed: a mail problem must never fail or slow the customer's
// chat. Sets HANDOFF_EMAILS_DISABLED=true to switch it off.
export async function notifyHandoff(input: Input): Promise<void> {
  try {
    await Promise.race([send(input), new Promise<void>((resolve) => setTimeout(resolve, TIMEOUT_MS))]);
  } catch (error) {
    console.error("Handoff notification failed:", error);
  }
}
