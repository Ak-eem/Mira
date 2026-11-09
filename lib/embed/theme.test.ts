import { embedTheme } from "./theme";
import { contrastRatio } from "../brandColor";

let failures = 0;
function check(name: string, ok: boolean) {
  if (ok) console.log(`PASS - ${name}`);
  else { failures += 1; console.error(`FAIL - ${name}`); }
}
const HEX = /^#[0-9a-f]{6}$/;

check("nothing set: an empty theme, so embed.js keeps its defaults", JSON.stringify(embedTheme(null, null)) === "{}");
check("junk values are ignored", JSON.stringify(embedTheme("red;background:url(//evil)", "<script>")) === "{}");

const brandOnly = embedTheme("#1a7f5a", null);
check("brand colour only: brand fields are set and the shell is left alone",
  brandOnly.brandColor === "#1a7f5a" && HEX.test(brandOnly.onBrandColor ?? "") && brandOnly.shellBackground === undefined);

const bgOnly = embedTheme(null, "#0f172a");
check("background only: the whole shell is set and the brand fields are left alone",
  bgOnly.shellBackground === "#0f172a" && bgOnly.brandColor === undefined &&
  [bgOnly.shellInk, bgOnly.shellSurface, bgOnly.shellLine].every((v) => HEX.test(v ?? "")));

check("short hex and upper case are normalised", embedTheme(null, "#FFF").shellBackground === "#ffffff");

// The bug this exists for: the shell's text must be readable on the shell's own background.
for (const bg of ["#0f172a", "#1f2937", "#111111", "#ffffff", "#f6f0e2", "#fde68a"]) {
  const t = embedTheme(null, bg);
  check(`${bg}: shell text ${t.shellInk} reads on it (${contrastRatio(t.shellInk!, bg).toFixed(1)}:1)`, contrastRatio(t.shellInk!, bg) >= 7);
}

// Controls sit on shellSurface: still readable, and visibly different from the shell.
for (const bg of ["#0f172a", "#f6f0e2"]) {
  const t = embedTheme(null, bg);
  check(`${bg}: control text stays readable on the control surface`, contrastRatio(t.shellInk!, t.shellSurface!) >= 7);
  check(`${bg}: the control surface and border differ from the background`, t.shellSurface !== bg && t.shellLine !== bg);
}

// Regression guard over the whole colour range (readableTextOn's known floor is ~3.9:1 for mid-tones).
let worst = 99;
for (let r = 0; r < 256; r += 15) for (let g = 0; g < 256; g += 15) for (let b = 0; b < 256; b += 15) {
  const hex = "#" + [r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("");
  worst = Math.min(worst, contrastRatio(embedTheme(null, hex).shellInk!, hex));
}
check(`no background colour gives shell text below 3.5:1 (worst ${worst.toFixed(2)}:1)`, worst >= 3.5);

if (failures) { console.error(`${failures} check(s) failed`); process.exit(1); }
