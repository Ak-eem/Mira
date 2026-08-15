// Anchored at the start of the (trimmed, lowercased) message on purpose
// -- an unanchored \bstop\b would false-positive on something like
// "please stop by our store", which has nothing to do with opting out
// of nudges.
const STOP_PATTERN = /^(stop( sending)?|unsubscribe|opt[\s-]?out|cancel)\b/i;

export function isOptOutMessage(message: string): boolean {
  return STOP_PATTERN.test(message.trim());
}
