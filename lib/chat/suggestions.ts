// The one-tap questions shown on an empty embedded chat. They used to be the same three for every
// business ("Show me your products", "Shipping information"...), which is wrong for a school or a
// cafe and sends a customer to an answer the business cannot give. They are now built from what the
// business actually has, and topped up with the owner's own FAQ questions.
export const MAX_SUGGESTIONS = 3;
export const PRODUCTS_SUGGESTION = "Show me your products";
export const SHIPPING_SUGGESTION = "Shipping information";
export const HOURS_SUGGESTION = "What are your hours?";

// Long FAQ questions do not fit on a chip and read badly there.
const MIN_FAQ_LENGTH = 4;
const MAX_FAQ_LENGTH = 60;
// Word boundaries keep "Friendship discount" from counting as a shipping policy.
const SHIPPING_POLICY = /\b(ship(ping|ped)?|deliver(y|ies)?)\b/i;

export type SuggestionFacts = {
  hasProducts: boolean;
  hasHours: boolean;
  policyTitles: string[];
  faqQuestions: string[];
};

const tidy = (text: string) => text.replace(/\s+/g, " ").trim();

export function buildSuggestions(facts: SuggestionFacts): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (text: string) => {
    const value = tidy(text);
    const key = value.toLowerCase();
    if (!value || seen.has(key) || out.length >= MAX_SUGGESTIONS) return;
    seen.add(key);
    out.push(value);
  };

  if (facts.hasProducts) add(PRODUCTS_SUGGESTION);
  if (facts.policyTitles.some((title) => SHIPPING_POLICY.test(title))) add(SHIPPING_SUGGESTION);
  if (facts.hasHours) add(HOURS_SUGGESTION);

  for (const question of facts.faqQuestions) {
    const value = tidy(question);
    if (value.length >= MIN_FAQ_LENGTH && value.length <= MAX_FAQ_LENGTH) add(value);
  }
  return out;
}
