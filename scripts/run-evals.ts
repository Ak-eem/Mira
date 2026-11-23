// Runs the fixed question set against the LIVE model with the real prompt and prints what failed.
//   npm run evals                 every case, once
//   npm run evals -- --runs 3     every case three times (a case passes only if all runs pass; the model varies a little)
//   npm run evals -- --only price-iphone
// Needs LLM_API_KEY (and GROQ_API_KEY if that is your fallback) in .env.local. It reads nothing from the database and
// sends nothing to customers.
import { composeReply } from "@/lib/ai/composeReply";
import { EVAL_CASES } from "@/lib/evals/cases";
import { checkReply } from "@/lib/evals/check";
import { FASHION_SHOP, TECH_SHOP } from "@/lib/evals/fixtures";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const runs = Math.max(1, parseInt(flag("runs") ?? "1", 10) || 1);
const only = flag("only");

async function main() {
  if (!process.env.LLM_API_KEY) {
    console.error("LLM_API_KEY is not set. Put it in .env.local (see .env.example) and run `npm run evals` again.");
    process.exit(2);
  }
  const cases = EVAL_CASES.filter((c) => !only || c.id === only);
  if (cases.length === 0) {
    console.error(`No case named "${only}".`);
    process.exit(2);
  }

  let failed = 0;
  for (const testCase of cases) {
    const fixture = testCase.fixture === "tech" ? TECH_SHOP : FASHION_SHOP;
    const problems: string[] = [];
    let lastReply = "";
    for (let run = 1; run <= runs; run++) {
      try {
        const result = await composeReply({ context: fixture.context, history: testCase.history ?? [], message: testCase.question, disableTools: true });
        lastReply = result.text;
        const verdict = checkReply(testCase, result.text, fixture);
        if (!verdict.pass) problems.push(`run ${run}: ${verdict.failures.join("; ")}`);
      } catch (error) {
        problems.push(`run ${run}: model call failed (${error instanceof Error ? error.message : String(error)})`);
      }
    }
    if (problems.length === 0) {
      console.log(`PASS  ${testCase.id}`);
    } else {
      failed++;
      console.log(`FAIL  ${testCase.id}\n      Q: ${testCase.question}\n      A: ${lastReply.replace(/\s+/g, " ").slice(0, 220)}\n      ${problems.join("\n      ")}`);
    }
  }
  console.log(`\n${cases.length - failed} of ${cases.length} cases passed${runs > 1 ? ` (${runs} runs each)` : ""}.`);
  process.exit(failed ? 1 : 0);
}

void main();
