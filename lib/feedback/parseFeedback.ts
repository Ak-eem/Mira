import { isFeedbackReason, type FeedbackReason } from "@/lib/feedback/reasons";
import { parseVisitorId } from "@/lib/chat/visitor";

export type CustomerFeedbackInput = {
  messageId: string;
  rating: "up" | "down";
  reason: FeedbackReason | null;
  businessSlug: string;
  visitorId: string;
};

export type ParsedFeedback = { ok: true; value: CustomerFeedbackInput } | { ok: false; error: string };

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validates the widget's feedback payload. businessSlug and visitorId are
 * required so the route can confirm the message really belongs to THIS
 * visitor's conversation, not just that it's some assistant message whose id
 * happens to be known.
 */
export function parseCustomerFeedback(body: unknown): ParsedFeedback {
  if (typeof body !== "object" || body === null) return { ok: false, error: "Invalid request." };
  const input = body as Record<string, unknown>;

  const messageId = typeof input.messageId === "string" ? input.messageId.trim() : "";
  const businessSlug = typeof input.businessSlug === "string" ? input.businessSlug.trim() : "";
  const visitorId = parseVisitorId(input.visitorId) ?? "";

  if (!UUID_REGEX.test(messageId) || !businessSlug || !visitorId) {
    return { ok: false, error: "messageId, businessSlug and visitorId are required." };
  }
  if (input.rating !== "up" && input.rating !== "down") {
    return { ok: false, error: "A valid rating ('up' or 'down') is required." };
  }

  const rawReason = input.reason;
  if (rawReason === undefined || rawReason === null) {
    return { ok: true, value: { messageId, rating: input.rating, reason: null, businessSlug, visitorId } };
  }
  if (!isFeedbackReason(rawReason)) return { ok: false, error: "Unknown reason." };
  if (input.rating !== "down") return { ok: false, error: "A reason can only be given with a thumbs-down." };

  return { ok: true, value: { messageId, rating: input.rating, reason: rawReason, businessSlug, visitorId } };
}
