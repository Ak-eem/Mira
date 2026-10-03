import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentBusinessOwner } from "@/lib/supabase/portal-auth";
import { createClient } from "@/lib/supabase/server";
import { describeSignal, type GroundingSignal } from "@/lib/grounding/assess";
import { getGroundingSettings } from "@/lib/grounding/settings";
import { CUSTOMER_REASON_LABELS, isFeedbackReason } from "@/lib/feedback/reasons";
import { ReplyReview } from "../conversations/[conversationId]/ReplyReview";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ businessId: string }> | { businessId: string };
};

const WINDOW_DAYS = 30;
const MAX_ITEMS = 40;

// A request-time clock read, kept out of the component body (the React purity
// lint rule rejects Date.now() during render; this runs once per request).
function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

type Item = {
  messageId: string;
  conversationId: string;
  reply: string;
  question: string | null;
  createdAt: string;
  verdict: "low" | "medium" | null;
  signals: GroundingSignal[];
  customer: { rating: "up" | "down"; reason: string | null } | null;
};

export default async function PortalReviewPage({ params }: PageProps) {
  const { businessId } = await Promise.resolve(params);

  const owner = await getCurrentBusinessOwner();
  const membership = owner?.businesses.find((b) => b.id === businessId);
  if (!owner || !membership) redirect("/portal/login");

  const supabase = await createClient();
  const settings = await getGroundingSettings(supabase, businessId);
  const levels = settings.reviewLevel === "medium" ? ["low", "medium"] : ["low"];
  const since = isoDaysAgo(WINDOW_DAYS);

  // 1. replies the answer check flagged
  const { data: flagged } = await supabase
    .from("message_assessments")
    .select("message_id, verdict, signals, question, created_at, messages!inner(content, conversation_id)")
    .eq("business_id", businessId)
    .in("verdict", levels)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(MAX_ITEMS);

  // 2. replies a customer gave a thumbs-down
  const { data: thumbsDown } = await supabase
    .from("message_feedback")
    .select("message_id, reason, created_at, messages!inner(content, conversation_id, business_id, created_at)")
    .eq("source", "customer")
    .eq("rating", "down")
    .eq("messages.business_id", businessId)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(MAX_ITEMS);

  type Joined<T> = T | T[] | null;
  const one = <T,>(value: Joined<T>): T | null => (Array.isArray(value) ? (value[0] ?? null) : value);

  const items = new Map<string, Item>();
  for (const row of flagged ?? []) {
    const message = one(row.messages as Joined<{ content: string; conversation_id: string }>);
    if (!message) continue;
    items.set(row.message_id, {
      messageId: row.message_id,
      conversationId: message.conversation_id,
      reply: message.content,
      question: row.question,
      createdAt: row.created_at,
      verdict: row.verdict as "low" | "medium",
      signals: (row.signals ?? []) as GroundingSignal[],
      customer: null,
    });
  }
  for (const row of thumbsDown ?? []) {
    const message = one(row.messages as Joined<{ content: string; conversation_id: string; created_at: string }>);
    if (!message) continue;
    const existing = items.get(row.message_id);
    const customer = { rating: "down" as const, reason: row.reason };
    if (existing) existing.customer = customer;
    else
      items.set(row.message_id, {
        messageId: row.message_id,
        conversationId: message.conversation_id,
        reply: message.content,
        question: null,
        createdAt: message.created_at,
        verdict: null,
        signals: [],
        customer,
      });
  }

  const ids = Array.from(items.keys());

  // Anything your team already reviewed drops off the list.
  const reviewed = new Set<string>();
  const staffByMessage = new Map<string, { rating: "up" | "down"; reason: string | null; note: string | null }>();
  if (ids.length > 0) {
    const { data: staffRows } = await supabase
      .from("message_feedback")
      .select("message_id, rating, reason, note")
      .eq("source", "staff")
      .in("message_id", ids);
    for (const row of staffRows ?? []) {
      reviewed.add(row.message_id);
      staffByMessage.set(row.message_id, { rating: row.rating, reason: row.reason, note: row.note });
    }
  }

  // Thumbs-down replies have no stored question: look up the customer message
  // that came just before each reply.
  const missingQuestion = Array.from(items.values()).filter((item) => !item.question && !reviewed.has(item.messageId));
  if (missingQuestion.length > 0) {
    const conversationIds = Array.from(new Set(missingQuestion.map((item) => item.conversationId)));
    const { data: customerMessages } = await supabase
      .from("messages")
      .select("conversation_id, content, created_at")
      .eq("business_id", businessId)
      .eq("role", "customer")
      .in("conversation_id", conversationIds)
      .order("created_at", { ascending: true })
      .limit(1000);
    for (const item of missingQuestion) {
      const before = (customerMessages ?? []).filter((m) => m.conversation_id === item.conversationId && m.created_at <= item.createdAt);
      item.question = before.length > 0 ? before[before.length - 1].content : null;
    }
  }

  const list = Array.from(items.values())
    .filter((item) => !reviewed.has(item.messageId))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="mb-1 mt-2 text-xl font-semibold">Needs review</h1>
        <p className="text-sm text-slate-500">
          Mira&apos;s replies from the last {WINDOW_DAYS} days that either mention something your business info doesn&apos;t
          back up, or that a customer marked as not helpful. Review each one so you know what to fix: your business
          info (wrong or outdated), an FAQ (incomplete), or the AI prompt (irrelevant or unclear).
          {membership.role === "owner" && (
            <>
              {" "}
              You can change what appears here in{" "}
              <Link href={`/portal/${businessId}/settings`} className="underline">
                Settings
              </Link>
              .
            </>
          )}
        </p>
      </div>

      {list.length === 0 && (
        <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500 shadow-sm">
          Nothing needs review right now.
        </p>
      )}

      <ul className="space-y-3">
        {list.map((item) => {
          const unsupported = item.signals.filter((signal) => !signal.supported);
          const customerReason = isFeedbackReason(item.customer?.reason) ? CUSTOMER_REASON_LABELS[item.customer.reason] : null;
          return (
            <li key={item.messageId} className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {item.verdict && (
                  <span
                    className={`rounded px-1.5 py-0.5 font-semibold uppercase ${item.verdict === "low" ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-700"}`}
                  >
                    Grounding: {item.verdict}
                  </span>
                )}
                {item.customer && (
                  <span className="rounded bg-red-50 px-1.5 py-0.5 text-red-600">
                    Customer 👎{customerReason ? ` ${customerReason}` : ""}
                  </span>
                )}
                <span className="text-slate-400">{new Date(item.createdAt).toLocaleString()}</span>
                <Link href={`/portal/${businessId}/conversations/${item.conversationId}`} className="ml-auto text-slate-400 underline">
                  Open conversation
                </Link>
              </div>

              {item.question && (
                <p className="text-sm text-slate-500">
                  <span className="font-medium text-slate-600">Customer asked:</span> {item.question}
                </p>
              )}
              <p className="whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-800">{item.reply}</p>

              {unsupported.length > 0 && (
                <ul className="list-disc space-y-0.5 pl-5 text-xs text-red-600">
                  {unsupported.map((signal) => (
                    <li key={`${signal.type}-${signal.value}`}>{describeSignal(signal)}</li>
                  ))}
                </ul>
              )}

              <ReplyReview
                businessId={businessId}
                conversationId={item.conversationId}
                messageId={item.messageId}
                customer={item.customer}
                staff={staffByMessage.get(item.messageId) ?? null}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
