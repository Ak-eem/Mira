import { checkReply, type EvalCase } from "./check";
import { EVAL_CASES } from "./cases";
import { FASHION_SHOP, TECH_SHOP } from "./fixtures";

function check(condition: boolean, message: string): void {
  console.log(`${condition ? "PASS" : "FAIL"} - ${message}`);
  if (!condition) process.exitCode = 1;
}

const priceCase: EvalCase = { id: "t", fixture: "tech", question: "How much is the iPhone 15 Pro?", mustInclude: ["1,450,000"] };
check(checkReply(priceCase, "The iPhone 15 Pro 256GB is ₦1,450,000.", TECH_SHOP).pass, "a correct price passes");
const wrong = checkReply(priceCase, "The iPhone 15 Pro is ₦1,234,567.", TECH_SHOP);
check(!wrong.pass && wrong.failures.some((f) => f.startsWith("invented price")) && wrong.failures.some((f) => f.startsWith("missing")), "a wrong price fails twice: invented and missing");
check(!checkReply(priceCase, "", TECH_SHOP).pass, "an empty reply fails");

const unknownCase: EvalCase = { id: "u", fixture: "tech", question: "How much is a PS5?", expectUnknown: true, mustNotInclude: [/₦\s?\d/] };
check(checkReply(unknownCase, "I don't have that information for Demo Tech Hub yet. I'd recommend contacting them directly to confirm.", TECH_SHOP).pass, "the standard fallback satisfies an unknown-product case");
check(!checkReply(unknownCase, "A PS5 is ₦650,000 here.", TECH_SHOP).pass, "inventing a price for an unknown product fails");

const trap: EvalCase = { id: "w", fixture: "tech", question: "3 year warranty?", mustNotInclude: [/3[- ]year/i] };
check(!checkReply(trap, "Yes, it has a 3 year warranty.", TECH_SHOP).pass, "agreeing to a warranty the shop never offered fails");

// every case is well formed and points at a real fixture
const ids = new Set<string>();
for (const c of EVAL_CASES) {
  check(!ids.has(c.id), `case id is unique: ${c.id}`);
  ids.add(c.id);
}
check(EVAL_CASES.length >= 25, `at least 25 cases (${EVAL_CASES.length})`);
check(EVAL_CASES.every((c) => c.fixture === "tech" || c.fixture === "fashion"), "every case names a known fixture");
check(EVAL_CASES.every((c) => (c.mustInclude?.length ?? 0) + (c.mustNotInclude?.length ?? 0) > 0 || c.expectUnknown), "every case checks something");

// every literal a case demands is actually written in its fixture, so a case can never ask for a fact the shop didn't give
for (const c of EVAL_CASES) {
  const knowledge = (c.fixture === "tech" ? TECH_SHOP : FASHION_SHOP).context.contextText;
  for (const needle of (c.mustInclude ?? []).filter((n): n is string => typeof n === "string" && /\d/.test(n))) {
    check(knowledge.includes(needle), `${c.id}: "${needle}" is in the ${c.fixture} fixture`);
  }
}
