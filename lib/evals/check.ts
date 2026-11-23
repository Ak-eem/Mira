import { assessGrounding } from "@/lib/grounding/assess";
import type { EvalFixture } from "@/lib/evals/fixtures";

// One eval case = a real kind of customer message plus what a safe, useful reply must (and must never) contain.
// Checking is pure so it is unit-tested without a model; only the runner calls the live model.

export type EvalCase = {
  id: string;
  fixture: "tech" | "fashion";
  question: string;
  history?: { role: "customer" | "assistant"; content: string }[];
  // Every one of these must appear (case-insensitive). A string is matched literally, a RegExp as written.
  mustInclude?: (string | RegExp)[];
  // None of these may appear.
  mustNotInclude?: (string | RegExp)[];
  // The shop's information does not cover this: the reply must say it doesn't know / will confirm, and invent nothing.
  expectUnknown?: boolean;
};

export type EvalResult = { id: string; pass: boolean; failures: string[] };

const UNKNOWN_PHRASE = /(don'?t|do not) have|not (sure|certain)|can'?t (confirm|say)|unable to confirm|contact (them|the team|us)|team (will|can) (confirm|help|follow)|confirm (with|directly)|not listed|not available/i;

function matches(text: string, pattern: string | RegExp): boolean {
  return typeof pattern === "string" ? text.toLowerCase().includes(pattern.toLowerCase()) : pattern.test(text);
}

export function checkReply(testCase: EvalCase, reply: string, fixture: EvalFixture): EvalResult {
  const failures: string[] = [];

  if (!reply.trim()) failures.push("empty reply");

  // Never state a price, time, link or contact the shop didn't give. The same check that gates live replies.
  const grounding = assessGrounding({
    reply,
    knowledge: fixture.context.contextText,
    customerMessages: [...(testCase.history ?? []).filter((m) => m.role === "customer").map((m) => m.content), testCase.question],
    businessName: fixture.name,
    currency: "NGN",
  });
  for (const signal of grounding.signals) {
    if (!signal.supported && signal.type !== "claim" && signal.type !== "fallback") failures.push(`invented ${signal.type}: ${signal.value}`);
  }

  for (const pattern of testCase.mustInclude ?? []) {
    if (!matches(reply, pattern)) failures.push(`missing: ${String(pattern)}`);
  }
  for (const pattern of testCase.mustNotInclude ?? []) {
    if (matches(reply, pattern)) failures.push(`must not say: ${String(pattern)}`);
  }
  if (testCase.expectUnknown && !UNKNOWN_PHRASE.test(reply)) failures.push("should have said it doesn't know / will confirm");

  return { id: testCase.id, pass: failures.length === 0, failures };
}
