// "Never a bare claim": every figure the assistant writes must trace back to a tool result. The model is told
// to quote numbers exactly and not to calculate, but a model can still slip, so the reply is checked here:
// any number that is neither in the tool results (or the owner's own question) nor an obvious derivation of
// two of them (a total, a gap, a percentage) is reported, and the caller then shows the raw numbers instead
// of the prose. Dates, years, clock times and list numbering are formatting, not claims, and are skipped.

const NUMBER = /\d[\d,]*(?:\.\d+)?/g;
const MONTH = "(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*";

// Cut out the parts of a reply where digits are formatting rather than figures.
const FORMATTING: RegExp[] = [
  /\b\d{1,2}(?::\d{2})?\s*[–-]\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/gi, // 6–8pm
  /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/gi, // 6pm, 6:30 pm
  /\b\d{1,2}:\d{2}\b/g, // 18:00
  /\b\d{4}-\d{2}-\d{2}\b/g, // 2026-11-02
  new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+${MONTH}\\b`, "gi"), // 26 Oct
  new RegExp(`\\b${MONTH}\\s+\\d{1,2}(?:st|nd|rd|th)?\\b`, "gi"), // Oct 26
  /\b(?:19|20)\d{2}\b/g, // years
  /^\s*(?:\d+[.)])\s+/gm, // "1. " list numbering
];

function normalise(token: string): string | null {
  const value = Number(token.replace(/,/g, ""));
  return Number.isFinite(value) ? String(value) : null;
}

function numbersIn(text: string): string[] {
  return (text.match(NUMBER) ?? []).map((token) => normalise(token.replace(/[.,]+$/, ""))).filter((value): value is string => value !== null);
}

// The numeric VALUES in the results (typed numbers), not digits that merely appear inside labels or dates:
// combining those would let almost any figure through by coincidence (59 - 19 = 40 from two hour labels).
function numericValues(value: unknown, out: number[] = []): number[] {
  if (typeof value === "number") out.push(value);
  else if (Array.isArray(value)) value.forEach((item) => numericValues(item, out));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => numericValues(item, out));
  return out;
}

function derivedFrom(values: number[]): Set<string> {
  const out = new Set<string>();
  const distinct = [...new Set(values.filter((v) => v > 0 && v < 1e12))].slice(0, 60);
  for (let i = 0; i < distinct.length; i += 1) {
    for (let j = 0; j < distinct.length; j += 1) {
      if (i === j) continue;
      const [a, b] = [distinct[i], distinct[j]];
      if (i < j) {
        out.add(String(Math.round((a + b) * 100) / 100));
        out.add(String(Math.round(Math.abs(a - b) * 100) / 100));
      }
      if (a < b) {
        out.add(String(Math.round((a / b) * 100)));
        out.add(String(Math.round((a / b) * 1000) / 10));
      }
    }
  }
  return out;
}

/** Numbers in `answer` that cannot be traced to `results` or `question`. Empty means every figure checks out. */
export function findUnsupportedNumbers(answer: string, results: unknown[], question: string): string[] {
  const sourceText = `${JSON.stringify(results)} ${question}`;
  const known = new Set(numbersIn(sourceText));
  const derived = derivedFrom(numericValues(results));

  let cleaned = answer;
  for (const pattern of FORMATTING) cleaned = cleaned.replace(pattern, " ");

  const unsupported = new Set<string>();
  for (const raw of cleaned.match(NUMBER) ?? []) {
    const token = raw.replace(/[.,]+$/, "");
    const value = normalise(token);
    if (value === null) continue;
    if (!known.has(value) && !derived.has(value)) unsupported.add(token);
  }
  return [...unsupported];
}
