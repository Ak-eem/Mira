import { brandTheme, checkBrandColor, checkChatColors, chatThemeVars, contrastRatio, darken, mix, parseBrandColor, readableTextOn, surfaceFor } from "./brandColor";

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

// --- mix / surface ---
check(mix("#000000", "#ffffff", 0.5) === "#808080", "mix: halfway between black and white");
check(mix("#123456", "#abcdef", 0) === "#123456" && mix("#123456", "#abcdef", 1) === "#abcdef", "mix: ends are exact");
check(surfaceFor("#ffffff") === "#ffffff", "surface: white background gives a white surface");
check(contrastRatio(surfaceFor("#111111"), "#111111") > 1 && surfaceFor("#111111") !== "#111111", "surface: dark background gets a slightly lighter card");

// --- checkChatColors ---
const none = checkChatColors({ brand: "", background: null });
check(none.ok && none.brand === null && none.background === null, "chat colours: both empty means all defaults");
const onlyBrand = checkChatColors({ brand: "#1A7F5A", background: "" });
check(onlyBrand.ok && onlyBrand.brand === "#1a7f5a", "chat colours: brand only is normalised");
check(checkChatColors({ brand: "#ffffe0", background: "" }).ok === false, "chat colours: near-white brand on the default white chat is rejected");
const darkChat = checkChatColors({ brand: "#f2a900", background: "#111111" });
check(darkChat.ok === true, "chat colours: marigold on near-black is fine");
check(checkChatColors({ brand: "#ffffe0", background: "#111111" }).ok === true, "chat colours: a pale brand colour is fine on a dark background");
check(checkChatColors({ brand: "#101010", background: "#111111" }).ok === false, "chat colours: brand colour matching the background is rejected");
check(checkChatColors({ brand: "", background: "#111111" }).ok === false, "chat colours: the default dark-green accent on a near-black background is rejected");
check(checkChatColors({ brand: "", background: "#ffffff" }).ok === true, "chat colours: white background with the default accent is fine");
check(checkChatColors({ brand: "nope", background: "" }).ok === false && checkChatColors({ brand: "", background: "x;y" }).ok === false, "chat colours: junk in either field is rejected");

// --- chatThemeVars ---
check(chatThemeVars(null, null) === undefined, "vars: nothing customised means no style at all");
const brandOnly = chatThemeVars("#1a7f5a", null);
check(!!brandOnly && brandOnly["--color-accent"] === "#1a7f5a" && !("--mira-wash" in brandOnly), "vars: brand only sets accent variables, not the background");
const dark = chatThemeVars("#f2a900", "#111111");
check(!!dark && dark["--mira-wash"] === "#111111" && dark["color"] === "#ffffff", "vars: dark background gets light text");
check(!!dark && contrastRatio(dark["--color-slate-600"], "#111111") >= 4.5, "vars: body grey is readable on the dark background");
const light = chatThemeVars(null, "#fafafa");
check(!!light && light["color"] === "#0f2a22" && contrastRatio(light["--color-slate-600"], "#fafafa") >= 4.5, "vars: light background keeps dark text, and the body grey is readable");
check(checkChatColors({ brand: "#1a7f5a", background: "#808080" }).ok === false, "chat colours: a mid-grey background is rejected (no readable text colour exists for it)");
for (const bg of ["#000000", "#ffffff", "#f6f0e2", "#1a1a2e", "#ffe97f", "#fafafa", "#111111"]) {
  const v = chatThemeVars(null, bg);
  check(!!v && contrastRatio(v["--color-slate-700"], bg) >= 7, `vars: strongest grey is clearly readable on ${bg}`);
}
