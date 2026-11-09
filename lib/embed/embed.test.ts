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

check("the embedded iframe background stays transparent", /\.mira-panel iframe \{[^}]*background: transparent;/.test(source));
check("no hard-coded brand name in the panel (it shows the site's data-title)", !/Mira assistant/.test(source));
check("the shell is painted from CSS variables, not a hard-coded translucent white", !/rgba\(255,255,255,0\.82\)/.test(source) && /var\(--mira-shell-bg\)/.test(source));
check("nothing in the widget uses innerHTML for the site-supplied title", !/innerHTML\s*=[^;]*title/.test(source));
// Behaviour (focus, launcher, colours, sizing, messages) is tested by running the script: embedBehavior.test.ts.
