import { assessGrounding, describeSignal, type GroundingInput } from "./assess";

// Manual assertions in the same style as the other lib tests --
// run with `npx tsx lib/grounding/grounding.test.ts`.

function check(label: string, pass: boolean) {
  console.log(`${pass ? "PASS" : "FAIL"} — ${label}`);
  if (!pass) process.exitCode = 1;
}

const knowledge = `Business: Ada's Store
Currency: NGN
Opening hours:
- Monday: 09:00 – 18:00
- Saturday: 10:00 – 16:00
- Sunday: Closed
Products:
- Red Ankara Dress: NGN 15000 (available, 5 in stock)
- Blue Ankara Dress: NGN 16000 (available)
- Leather Sandals: NGN 8000 (available, 2 in stock)
FAQs:
Q: Do you deliver?
A: Yes, we deliver within Lagos for a flat fee of NGN 2000. Pay by bank transfer.
Contact: adasstore@example.com, +234 801 234 5678, https://adas-store.com/shop
Custom Guidance: Never promise same-day delivery.`;

const base: GroundingInput = { reply: "", knowledge, customerMessages: [], businessName: "Ada's Store", currency: "NGN" };
const run = (reply: string, customerMessages: string[] = []) => assessGrounding({ ...base, reply, customerMessages });

// ---- prices
check("correct price -> high", run("The Red Ankara Dress is ₦15,000.").verdict === "high");
check("wrong price -> low", run("The Red Ankara Dress is ₦13,400.").verdict === "low");
check("a plausible price+fee combination is NOT flagged (blue dress + ₦2,000 delivery)", run("Blue dress with delivery would be ₦18,000.").verdict === "high");
check("small incidental numbers do not excuse a wrong total", run("The total is ₦15,005.").verdict === "low");
check("price written as NGN 15000 matches", run("It costs NGN 15000.").verdict === "high");
check("price written as 15k naira matches", run("That one is 15k naira.").verdict === "high");
check("N15,000 shorthand matches", run("It's N15,000 only.").verdict === "high");
check("quantity x price is supported (2 x 15000)", run("Two Red Ankara Dresses come to ₦30,000.").verdict === "high");
check("sum of two products is supported", run("The red and blue dresses together are ₦31,000.").verdict === "high");
check("total plus delivery fee is supported", run("Total with delivery: ₦32,000.").verdict === "high");
check("made-up total is flagged", run("Your total is ₦47,500.").verdict === "low");
check("amount the customer stated is supported", run("Your ₦20,000 budget works.", ["my budget is 20,000"]).verdict === "high");
check("one wrong price among correct ones -> low", run("Red is ₦15,000 and sandals are ₦9,500.").verdict === "low");
check("wrong price signal is reported as unsupported", (() => { const r = run("Sandals are ₦9,500."); return r.signals.some((s) => s.type === "price" && !s.supported); })());

// ---- hours
check("correct hours -> high", run("We open 9am to 6pm on Mondays.").verdict === "high");
check("24h format matches 12h wording", run("Monday hours are 09:00 to 18:00.").verdict === "high");
check("wrong closing time -> low", run("We close at 8pm on Mondays.").verdict === "low");
check("time the customer mentioned is supported", run("See you at 5pm then!", ["I'll come at 5pm"]).verdict === "high");

// ---- contact + links
check("known email -> high", run("Email us at adasstore@example.com.").verdict === "high");
check("unknown email -> low", run("Email us at sales@adas.ng.").verdict === "low");
check("known phone in different spacing -> high", run("Call 0801 234 5678.").verdict === "high");
check("unknown phone -> low", run("Call 0803 999 1111.").verdict === "low");
check("known link -> high", run("Browse at https://adas-store.com/shop today.").verdict === "high");
check("unknown link -> low", run("Order at www.adas-fashion.com now.").verdict === "low");
check("phone digits are not mistaken for a price", run("Call +234 801 234 5678.").signals.every((s) => s.type !== "price"));

// ---- policy claims
check("delivery claim covered by FAQ -> high", run("Yes, we deliver within Lagos.").verdict === "high");
check("uncovered refund claim -> medium", run("You can get a full refund within 7 days.").verdict === "medium");
check("uncovered warranty claim -> medium", run("All dresses come with a one-year warranty.").verdict === "medium");
check("a question is not a claim", run("Would you like us to arrange a refund?").verdict === "unchecked");
check("covered payment method -> high", run("You can pay by bank transfer.").verdict === "high");
check("uncovered payment method -> medium", run("You can pay with mobile money.").verdict === "medium");
check("another uncovered payment method -> medium", run("We also accept cash on delivery.").verdict === "medium");

// ---- fallback + unchecked
check("fallback sentence -> low", run("I don't have that information for Ada's Store yet -- I'd recommend contacting them directly to confirm.").verdict === "low");
check("plain chat with no checkable facts -> unchecked", run("Sure, happy to help! Which dress are you interested in?").verdict === "unchecked");
check("fallback signal is labelled", run("I don't have that information for Ada's Store yet -- I'd recommend contacting them directly to confirm.").signals[0]?.type === "fallback");

// ---- robustness
check("empty reply does not throw", run("").verdict === "unchecked");
check("many figures are capped", assessGrounding({ ...base, reply: Array.from({ length: 40 }, (_, i) => `₦${i + 1}001`).join(" ") }).signals.length <= 12);
check("describeSignal reads naturally", describeSignal({ type: "price", value: "₦18,000", supported: false }).includes("isn't in your business info"));
check("year/quantity numbers are not treated as prices", run("We've been open since 2019 and have 3 branches.").verdict === "unchecked");
