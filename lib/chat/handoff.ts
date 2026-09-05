export type HandoffReason = "requested" | "confused";

// Signals the customer is frustrated with Mira specifically -- the
// "repeated confusion" half of the handoff trigger, independent of
// classifyIntent's explicit "speak to a human" detection. Deliberately
// narrow: general negativity ("this is annoying") isn't enough on its
// own, it has to read as directed at not being understood or not being
// helped.
const FRUSTRATION_PATTERN =
  /\b(you'?re not (getting|understanding)( it| me)?|that'?s not what i (asked|meant|said)|i (already )?said that|you don'?t understand|this (isn'?t|is not) helping|wrong answer|not what i (need|asked for)|not helpful)\b/i;

export function isFrustrationSignal(message: string): boolean {
  return FRUSTRATION_PATTERN.test(message.trim());
}

// Shown for every customer message that arrives after a conversation has
// already been flagged for a human -- deliberately different from
// getHandoffReply's "already flagged" copy below, which is for the rare
// case of losing a flagging race in the same request. This is the common
// path: the AI is intentionally not re-engaging with the message content
// at all here, so the copy must not imply otherwise.
export function getPausedReply(businessName: string): string {
  return `Thanks for the extra info — I've added it to what the ${businessName} team can see, and they'll pick up the full conversation here shortly.`;
}

// Deterministic, never model-generated -- the bug this exists to fix is
// specifically "the model improvises" at the handoff moment, so this path
// never calls the LLM. Never mentions WhatsApp: a customer already inside
// the web widget, or already texting WhatsApp, doesn't need to be pointed
// somewhere else -- they need to know a person on THIS thread is coming.
export function getHandoffReply(
  businessName: string,
  reason: HandoffReason,
  alreadyFlagged: boolean,
): string {
  if (reason === "requested") {
    return alreadyFlagged
      ? `I've already let the ${businessName} team know you'd like to speak with someone — they'll jump in here as soon as they can.`
      : `Got it — I've let the ${businessName} team know you'd like to speak with someone, and they'll follow up right here as soon as they can.`;
  }

  return alreadyFlagged
    ? `I don't want to keep going in circles on this one — I've already flagged it for the ${businessName} team and they'll pick it up here shortly.`
    : `I think this needs a closer look than I can give it — I've let the ${businessName} team know, and they'll follow up right here shortly. Sorry for the runaround!`;
}
