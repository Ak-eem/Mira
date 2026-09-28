// A customer telling us their order arrived, on channels with no button
// (WhatsApp, email). Deliberately narrow and whole-message only: "did my order
// get delivered?" must never trip it, "delivered" / "received" / "I've received
// it" must.
const DELIVERY_CONFIRMATION =
  /^\s*(?:yes[,!. ]+)?(?:(?:i(?:'ve| have)?|we(?:'ve| have)?)\s+(?:just\s+)?(?:received|got|collected)(?:\s+(?:it|my order|the order|everything))?|(?:it|my order|the order)\s+(?:has\s+|just\s+)?(?:arrived|been delivered)|order\s+(?:received|delivered)|delivered|received|it(?:'s| has)? arrived)\s*[.!]*\s*$/i;

export function isDeliveryConfirmation(message: string): boolean {
  return DELIVERY_CONFIRMATION.test(message.trim());
}
