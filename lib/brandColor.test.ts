import { brandTheme, checkBrandColor, contrastRatio, darken, parseBrandColor, readableTextOn } from "./brandColor";

function check(condition: boolean, message: string): void {
  console.log(`${condition ? "PASS" : "FAIL"} - ${message}`);
  if (!condition) process.exitCode = 1;
}

// --- parseBrandColor ---
check(parseBrandColor("#0F2A22") === "#0f2a22", "parse: uppercase is lowercased");
check(parseBrandColor("0f2a22") === "#0f2a22", "parse: missing # is accepted");
check(parseBrandColor("  #abc ") === "#aabbcc", "parse: 3-digit shorthand expands, whitespace trimmed");
check(parseBrandColor("#12345") === null && parseBrandColor("#gggggg") === null, "parse: wrong length or non-hex is rejected");
check(parseBrandColor("red; background:url(x)") === null, "parse: CSS injection attempt is rejected");
check(parseBrandColor(null) === null && parseBrandColor(42) === null, "parse: non-strings are rejected");

// --- contrast + readable text ---
check(Math.round(contrastRatio("#000000", "#ffffff")) === 21, "contrast: black on white is 21");
check(readableTextOn("#0f2a22") === "#ffffff", "text: dark brand colour gets white text");
check(readableTextOn("#f2a900") === "#0f2a22", "text: marigold gets dark text");
check(readableTextOn("#ffffff") === "#0f2a22", "text: white gets dark text");
check(readableTextOn("#1a7f5a") === "#ffffff", "text: mid green gets white text");

// --- darken ---
check(darken("#ffffff", 0.5) === "#808080", "darken: halfway to black");
check(darken("#000000", 0.5) === "#000000", "darken: black stays black");

// --- checkBrandColor ---
check(checkBrandColor("#1a7f5a").ok === true, "check: ordinary brand colour is accepted");
check(checkBrandColor("#f2a900").ok === true, "check: marigold (light but visible) is accepted");
const pale = checkBrandColor("#ffffe0");
check(pale.ok === false && /too light/.test(pale.ok ? "" : pale.error), "check: near-white is rejected with a clear reason");
const junk = checkBrandColor("blue");
check(junk.ok === false, "check: colour names are not hex and are rejected");

// --- brandTheme ---
const theme = brandTheme("#1a7f5a");
check(theme.accent === "#1a7f5a" && theme.accentDark !== theme.accent && theme.onAccent === "#ffffff", "theme: accent kept, hover shade differs, text readable");
