import { readFileSync } from "node:fs";

// The full-screen business page and the embedded widget render the same ChatWindow. They drifted apart
// once (the widget got a new look, the full page kept the old one), so this pins the shared pieces:
// each is written once, with no embedMode ternary choosing between two looks. Layout differences that
// are meant to differ (the business-name header, the transparent surface) are allowed and listed.
const source = readFileSync("app/chat/[businessSlug]/ChatWindow.tsx", "utf8");

let failures = 0;
function check(name: string, ok: boolean) {
  if (ok) console.log(`PASS - ${name}`);
  else { failures += 1; console.error(`FAIL - ${name}`); }
}

const oldFullScreenOnly: [string, string][] = [
  ["glass-panel-strong flex gap-2 px-4 py-3", "the square composer bar"],
  ["glass-panel inline-block max-w-[85%] rounded-lg px-3 py-2", "the old assistant bubble"],
  ["rgba(15,118,110,0.6)", "the old customer bubble shadow"],
  ["text-slate-300 hover:text-slate-500", "the old feedback thumb colours"],
  ["\"glass-panel-strong\"} pb-2", "the boxed footer strip"],
  ["glass-panel inline-block max-w-[85%]\"} rounded-xl", "the old left-aligned welcome bubble"],
];
for (const [needle, what] of oldFullScreenOnly) check(`the old full-screen-only look is gone: ${what}`, !source.includes(needle));

const messageInputs = source.match(/placeholder="Ask a question…"/g) ?? [];
check("there is exactly one message input, and it is the rounded pill", messageInputs.length === 1 && /rounded-full border border-slate-200 bg-white px-2 py-1[\s\S]{0,400}placeholder="Ask a question…"/.test(source));
check("the welcome screen (icon, heading, chips) is not hidden behind embedMode", !/embedMode && <h2/.test(source) && !/\{embedMode && \(\s*<div className="mx-auto flex h-12/.test(source));
check("suggestion chips are shown whenever there are any, in both modes", /suggestions\.length > 0 && \(/.test(source) && !/embedMode && \(\s*<div[^>]*Suggested questions/.test(source));
check("both modes use the same single-column wrapper", source.includes("max-w-3xl flex-1 flex-col"));
check("both modes are one full-height page (no min-h-screen variant)", !source.includes("min-h-screen flex-col\"") || source.includes("mira-wash items-center justify-center"));
check("feedback controls use contrasting theme colors for either selection state",
  source.includes("border-teal-900 bg-teal-900 p-1.5 text-white") &&
  source.includes("border-slate-200 bg-white p-1.5 text-teal-900") &&
  source.includes('aria-pressed={m.feedback === "up"}') &&
  source.includes('aria-pressed={m.feedback === "down"}'));
check("End chat uses a theme-aware contrasting surface and foreground",
  /onClick=\{\(\) => setShowEndConfirm\(true\)\}[\s\S]{0,260}bg-white[\s\S]{0,100}text-teal-900/.test(source));

// What may still depend on embedMode: keep this list short and deliberate.
const uses = [...source.matchAll(/embedMode/g)].length;
check(`embedMode is only used for the intended differences (${uses} references)`, uses <= 14);

if (failures) { console.error(`${failures} check(s) failed`); process.exit(1); }
