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

check("the panel does not add a branded title header above the chat", !/mira-panel-header|headerTitle/.test(source));
check("the widget shell has a translucent background", /background: rgba\(255,255,255,0\.82\)/.test(source));
check("the embedded iframe background stays transparent", /\.mira-panel iframe \{[^}]*background: transparent;/.test(source));
check("panel resizing uses a spring easing", /width 0\.52s cubic-bezier\(0\.34, 1\.56, 0\.64, 1\), height 0\.52s cubic-bezier\(0\.34, 1\.56, 0\.64, 1\)/.test(source));
check("mobile expansion animates its edges and height", /right: 8px; bottom: 8px; left: 8px; width: auto; height: calc\(100vh - 16px\)/.test(source));
check("the launcher hides while the panel is open", /\.mira-panel\.mira-open ~ \.mira-bubble \{ opacity: 0; visibility: hidden; pointer-events: none; \}/.test(source));
check("the embedded chat can close the panel through a trusted same-origin message", /event\.data\.type === "mira:close"/.test(source));
