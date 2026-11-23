import { assessGrounding, type GroundingInput, type GroundingSignal } from "@/lib/grounding/assess";

// The check BEFORE a reply is sent. assessGrounding (the same deterministic overlap check the Review page uses) finds the
// checkable facts in a drafted reply; here only the ones that cost a shop money when wrong can stop it from going out:
// a price, a time, a link or a phone/email that is not in the business's own information and was not given by the
// customer. Softer policy-wording signals ("delivery", "warranty") still only flag the reply afterwards, because a false
// block on those would turn good answers into "I don't know".
const BLOCKING: GroundingSignal["type"][] = ["price", "time", "link", "contact"];

export function findUnsupportedFacts(input: GroundingInput): GroundingSignal[] {
  return assessGrounding(input).signals.filter((s) => BLOCKING.includes(s.type) && !s.supported);
}

// Added to the prompt for the one rewrite. Quotes only the offending values, never anything the customer wrote.
export function correctionNote(unsupported: GroundingSignal[]): string {
  const list = unsupported.map((s) => `"${s.value.slice(0, 60)}"`).join(", ");
  return [
    "CORRECTION: your previous draft stated details that are not in the business information:",
    list + ".",
    "Write the answer again using ONLY facts from the business information above. If the detail the customer needs is not there, say you don't have it and that the team will confirm. Do not state any price, time, link, phone number or email that is not written in the business information.",
  ].join("\n");
}
