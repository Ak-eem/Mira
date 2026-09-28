import { formatMoney } from "@/lib/orders/status";
import type { ResolveResult, ResolvedItem } from "@/lib/orders/resolveItems";

// Every order-taking reply is deterministic, never model-generated: the same
// reasoning as getHandoffReply -- money and commitments are exactly where an
// improvising model must not be the one writing the words.

export function getOrderRecapReply(items: ResolvedItem[], total: number, currency: string, businessName: string): string {
  const lines = items.map(
    (item) => `- ${item.quantity} × ${item.name} — ${formatMoney(item.unit_price * item.quantity, currency)}`,
  );
  return (
    `Here's your order:\n${lines.join("\n")}\nTotal: ${formatMoney(total, currency)}\n\n` +
    `Reply YES and I'll send it to the ${businessName} team to confirm, or tell me what you'd like to change.`
  );
}

export function getOrderPlacedReply(businessName: string): string {
  return `Thank you! I've sent your order to the ${businessName} team. They'll confirm it here shortly and I'll keep you posted.`;
}

export function getOrderProblemReply(result: Extract<ResolveResult, { ok: false }>): string {
  switch (result.reason) {
    case "unknown":
      return `I couldn't find "${result.itemName}" in the catalogue. Could you tell me which item you mean?`;
    case "ambiguous":
      return `Which one do you mean for "${result.itemName}": ${(result.options ?? []).join(", ")}?`;
    case "unavailable":
      return `Sorry, ${result.itemName} isn't available in that quantity right now. Would you like something else, or a smaller amount?`;
    case "invalid_quantity":
      return `Could you double-check the quantity for ${result.itemName}? I need a whole number, please.`;
    case "too_many":
      return "That's a lot of different items for one order. Could we split it into a couple of smaller orders?";
    default:
      return "I didn't quite catch what you'd like to order. Could you tell me the items and quantities?";
  }
}

export function getDeliveryThanksReply(): string {
  return "Wonderful, thanks for letting us know! Your order is marked as delivered. Message us any time if you need anything else.";
}
