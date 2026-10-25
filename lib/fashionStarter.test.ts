import { buildFashionStarter, normalizeFashionAnswers, cleanNote, hasAnyFashionAnswer, EMPTY_FASHION_ANSWERS, MAX_DELIVERY_NOTE, type FashionAnswers } from "./fashionStarter";

function check(condition: boolean, message: string): void {
  console.log(`${condition ? "PASS" : "FAIL"} - ${message}`);
  if (!condition) process.exitCode = 1;
}
function ok(input: unknown): FashionAnswers {
  const r = normalizeFashionAnswers(input);
  if (!r.ok) throw new Error(r.error);
  return r.answers;
}

// Nothing answered -> nothing invented.
const none = buildFashionStarter(EMPTY_FASHION_ANSWERS);
check(none.faqs.length === 0 && none.policies.length === 0, "no answers produces no FAQs or policies");
check(!hasAnyFashionAnswer(EMPTY_FASHION_ANSWERS), "an untouched step counts as no answers");

// Each answer produces only its own item.
const mtm = buildFashionStarter(ok({ madeToMeasure: true }));
check(mtm.faqs.length === 1 && mtm.policies.length === 0 && /Yes/.test(mtm.faqs[0].answer), "made-to-measure yes gives one FAQ");
check(buildFashionStarter(ok({ madeToMeasure: false })).faqs[0].answer.startsWith("No"), "made-to-measure no gives a no");

const pay = buildFashionStarter(ok({ payments: ["cod", "transfer"] }));
check(pay.faqs[0].answer === "You can pay by bank transfer and pay on delivery.", "payment methods are listed in a fixed order");
check(buildFashionStarter(ok({ payments: ["transfer", "card", "cod"] })).faqs[0].answer === "You can pay by bank transfer, card and pay on delivery.", "three methods read naturally");
check(buildFashionStarter(ok({ payments: ["card"] })).faqs[0].answer === "You can pay by card.", "a single method reads naturally");

check(buildFashionStarter(ok({ returns: "none" })).policies[0].content.includes("don't accept returns"), "no-returns policy");
check(buildFashionStarter(ok({ returns: "exchange", returnDays: 7 })).policies[0].content === "We exchange items within 7 days of delivery but don't give refunds.", "exchange-only with a window");
check(buildFashionStarter(ok({ returns: "returns", returnDays: 14 })).policies[0].content === "We accept returns and exchanges within 14 days of delivery.", "returns with a window");
const noDays = buildFashionStarter(ok({ returns: "returns" })).policies[0].content;
check(!/\d/.test(noDays), "returns without a window states no number");
check(ok({ returns: "none", returnDays: 7 }).returnDays === null, "a return window is dropped when no returns are offered");

// Owner's own delivery words are kept, cleaned and capped.
check(buildFashionStarter(ok({ deliveryNote: "  Lagos 1-2 days,\n other states 3-5 days  " })).faqs[0].answer === "Lagos 1-2 days, other states 3-5 days", "delivery note is cleaned to one line");
check(cleanNote("x".repeat(500)).length === MAX_DELIVERY_NOTE, "delivery note is capped");
check(cleanNote("a\u0000b\u0007c") === "a b c", "control characters are removed");
check(buildFashionStarter(ok({ deliveryNote: "   " })).faqs.length === 0, "a blank delivery note produces nothing");

// Bad input is rejected, not coerced.
check(!normalizeFashionAnswers(null).ok && !normalizeFashionAnswers([]).ok && !normalizeFashionAnswers("x").ok, "non-objects are rejected");
check(!normalizeFashionAnswers({ madeToMeasure: "yes" }).ok, "wrong type for made-to-measure is rejected");
check(!normalizeFashionAnswers({ returns: "refund-all" }).ok, "unknown returns option is rejected");
check(!normalizeFashionAnswers({ returns: "returns", returnDays: 0 }).ok && !normalizeFashionAnswers({ returns: "returns", returnDays: 500 }).ok && !normalizeFashionAnswers({ returns: "returns", returnDays: 2.5 }).ok, "bad return windows are rejected");
check(!normalizeFashionAnswers({ payments: ["bitcoin"] }).ok && !normalizeFashionAnswers({ payments: "card" }).ok, "unknown payment methods are rejected");
check(!normalizeFashionAnswers({ deliveryNote: 5 }).ok, "non-text delivery note is rejected");

// The whole starter set must fit comfortably inside Mira's 900-character FAQ budget
// (and 550 for policies), leaving room for the owner's own FAQs.
const worst = buildFashionStarter(ok({ madeToMeasure: true, returns: "returns", returnDays: 90, deliveryNote: "y".repeat(500), payments: ["transfer", "card", "cod"] }));
const faqChars = worst.faqs.reduce((n, f) => n + f.question.length + f.answer.length, 0);
const policyChars = worst.policies.reduce((n, p) => n + p.title.length + p.content.length, 0);
check(faqChars <= 520, `starter FAQs stay within budget even at maximum input (${faqChars} chars)`);
check(policyChars <= 150, `starter policy stays within budget (${policyChars} chars)`);
