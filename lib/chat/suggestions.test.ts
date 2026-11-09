import { buildSuggestions, HOURS_SUGGESTION, MAX_SUGGESTIONS, PRODUCTS_SUGGESTION, SHIPPING_SUGGESTION } from "./suggestions";

let failures = 0;
function check(name: string, ok: boolean) {
  if (ok) console.log(`PASS - ${name}`);
  else { failures += 1; console.error(`FAIL - ${name}`); }
}
const none = { hasProducts: false, hasHours: false, policyTitles: [], faqQuestions: [] };
const same = (a: string[], b: string[]) => JSON.stringify(a) === JSON.stringify(b);

check("a business with no data gets no chips (the row is not shown at all)", same(buildSuggestions(none), []));

check("a shop: products, shipping, hours",
  same(buildSuggestions({ hasProducts: true, hasHours: true, policyTitles: ["Shipping & returns"], faqQuestions: [] }),
    [PRODUCTS_SUGGESTION, SHIPPING_SUGGESTION, HOURS_SUGGESTION]));

check("no products: the products chip is not offered", !buildSuggestions({ ...none, hasHours: true }).includes(PRODUCTS_SUGGESTION));
check("no shipping or delivery policy: no shipping chip", !buildSuggestions({ ...none, hasProducts: true, policyTitles: ["Refund policy"] }).includes(SHIPPING_SUGGESTION));
check("'Delivery times' counts as a shipping policy", buildSuggestions({ ...none, policyTitles: ["Delivery times"] }).includes(SHIPPING_SUGGESTION));
check("'Friendship discount' does not", !buildSuggestions({ ...none, policyTitles: ["Friendship discount"] }).includes(SHIPPING_SUGGESTION));
check("no hours set: no hours chip", !buildSuggestions({ ...none, hasProducts: true }).includes(HOURS_SUGGESTION));

check("a school or cafe with hours and FAQs: hours, then the owner's own questions",
  same(buildSuggestions({ ...none, hasHours: true, faqQuestions: ["How do I apply?", "What are the term fees?", "Is there a uniform?"] }),
    [HOURS_SUGGESTION, "How do I apply?", "What are the term fees?"]));

check(`never more than ${MAX_SUGGESTIONS} chips`,
  buildSuggestions({ hasProducts: true, hasHours: true, policyTitles: ["Shipping"], faqQuestions: ["A question?", "Another one?"] }).length === MAX_SUGGESTIONS);

check("an FAQ that repeats a built-in chip (any case) is not shown twice",
  same(buildSuggestions({ ...none, hasHours: true, faqQuestions: ["what are your hours?", "Do you do refunds?"] }), [HOURS_SUGGESTION, "Do you do refunds?"]));
check("an over-long or tiny FAQ question is skipped",
  same(buildSuggestions({ ...none, faqQuestions: ["x".repeat(61), "Hi", "Do you take cards?"] }), ["Do you take cards?"]));
check("extra whitespace in an FAQ is tidied", same(buildSuggestions({ ...none, faqQuestions: ["  Do   you\ndeliver?  "] }), ["Do you deliver?"]));

if (failures) { console.error(`${failures} check(s) failed`); process.exit(1); }
