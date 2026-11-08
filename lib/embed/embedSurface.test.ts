import { embedStrongHoverClass, embedStrongTextClass, embedUsesTransparentSurface } from "./surface";
import { chatThemeVars, contrastRatio } from "../brandColor";

let failures = 0;
function check(name: string, ok: boolean) {
  if (ok) console.log(`PASS - ${name}`);
  else { failures += 1; console.error(`FAIL - ${name}`); }
}

check("embed with no custom background is see-through (default look unchanged)", embedUsesTransparentSurface(true, null) === true);
check("embed with an empty background is see-through", embedUsesTransparentSurface(true, undefined) === true);
check("embed with a custom background keeps the owner's colour", embedUsesTransparentSurface(true, "#0f172a") === false);
check("the full-page chat is never forced transparent", embedUsesTransparentSurface(false, null) === false);

// The bug this guards: dark background + transparent surface = white text on the white embed shell.
for (const bg of ["#0f172a", "#1f2937", "#111111"]) {
  const text = chatThemeVars(null, bg)!["color"];
  check(`${bg}: its light text (${text}) would be unreadable on the white shell, so the surface must not go transparent`,
    contrastRatio(text, "#ffffff") < 3 && embedUsesTransparentSurface(true, bg) === false);
}

check("default embed headings keep slate-900", embedStrongTextClass(null) === "text-slate-900");
check("custom background uses a palette-aware text class", embedStrongTextClass("#0f172a") === "text-slate-700");
check("hover is black by default and palette-aware on a custom background", embedStrongHoverClass(null) === "hover:text-black" && embedStrongHoverClass("#0f172a") === "hover:text-slate-600");
if (failures) { console.error(`${failures} check(s) failed`); process.exit(1); }
