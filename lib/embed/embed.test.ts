import { readFileSync } from "node:fs";

// Run with `npx tsx lib/embed/embed.test.ts`.
// public/embed.js is plain JavaScript with its CSS written as strings, so no
// linter or type-checker ever looks inside them. A Tailwind upgrade codemod once
// rewrote `flex-shrink: 0` there to the invalid `shrink: 0` (a Tailwind class
// name, not a CSS property), silently breaking the widget on customers' sites.

function check(label: string, pass: boolean) {
  console.log(`${pass ? "PASS" : "FAIL"} — ${label}`);
  if (!pass) process.exitCode = 1;
}

const source = readFileSync("public/embed.js", "utf8");

// Tailwind utility names that are not CSS properties.
const NOT_CSS_PROPERTIES = ["shrink", "grow", "basis", "shadow-xs", "blur-xs", "rounded-sm", "outline-hidden"];
for (const name of NOT_CSS_PROPERTIES) {
  const asDeclaration = new RegExp(`["';{\\s]${name}\\s*:`);
  check(`embed.js has no "${name}:" declaration (not a CSS property)`, !asDeclaration.test(source));
}

const header = source.match(/\.mira-panel-header\s*\{[^}]*"\s*\+?[^]*?\}/);
check("the panel header keeps flex-shrink: 0 so it can't be squashed", /\.mira-panel-header \{[\s\S]*?flex-shrink: 0;[\s\S]*?"\}"/.test(source) || (header !== null && /flex-shrink: 0/.test(header[0])));
