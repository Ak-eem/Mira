import { cooldownActive, stampCooldown } from "@/lib/alerts/core";
import { renderHandoffEmail, type HandoffNoticeReason } from "./handoffEmail";

type Client = { from: (table: string) => any; auth: { admin: { getUserById: (id: string) => Promise<{ data: { user: { email?: string | null } | null } }> } } };  

export const HANDOFF_EMAIL_COOLDOWN_MINUTES = 10;

export type HandoffDeps = {
  send: (to: string, subject: string, html: string) => Promise<unknown>;
  siteUrl: string;
  now?: () => Date;
};

/**
 * Email the business's owners/team that a conversation needs a person. Best effort: it never throws and never
 * blocks the customer's reply. At most one email per business per cooldown window, so a burst of customers
 * does not flood an inbox; the email says how many are waiting.
 */
export async function notifyOwnersOfHandoff(
  client: Client,
  input: { businessId: string; conversationId: string; reason: HandoffNoticeReason },
  deps: HandoffDeps,
): Promise<"sent" | "suppressed" | "no_recipients" | "failed"> {
  try {
    const now = (deps.now ?? (() => new Date()))();
    const key = `handoff:${input.businessId}`;
    if (await cooldownActive(client, key, HANDOFF_EMAIL_COOLDOWN_MINUTES, now)) return "suppressed";

    const [members, business, waiting] = await Promise.all([
      client.from("business_owners").select("user_id").eq("business_id", input.businessId),
      client.from("businesses").select("name").eq("id", input.businessId).maybeSingle(),
      client.from("conversations").select("id", { count: "exact", head: true }).eq("business_id", input.businessId).eq("needs_human", true),
    ]);
    if (members.error) throw members.error;

    const emails = (
      await Promise.all(((members.data ?? []) as Array<{ user_id: string }>).map(async (m) => (await client.auth.admin.getUserById(m.user_id)).data.user?.email ?? null))
    ).filter((email): email is string => Boolean(email));
    if (emails.length === 0) return "no_recipients";

    const mail = renderHandoffEmail({
      businessName: business.data?.name ?? "Your business",
      reason: input.reason,
      link: `${deps.siteUrl}/portal/${input.businessId}/conversations/${input.conversationId}`,
      waiting: waiting.count ?? 1,
    });
    const results = await Promise.allSettled(emails.map((to) => deps.send(to, mail.subject, mail.html)));
    if (!results.some((r) => r.status === "fulfilled")) throw new Error("every handoff email failed to send");
    await stampCooldown(client, key, now);
    return "sent";
  } catch (error) {
    console.error("notifyOwnersOfHandoff failed:", error);
    return "failed";
  }
}
