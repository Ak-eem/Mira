// Brand colour for a business's customer-facing chat. Owners pick ONE colour; everything
// else (hover shade, readable text colour) is derived here so a business can't end up
// with unreadable buttons. Pure functions, safe to use on the server and in the browser.

export const DEFAULT_BRAND_COLOR = "#0f2a22";

// The cream the chat uses when no background is set. Only used to draw the Settings preview.
export const DEFAULT_CHAT_BACKGROUND = "#f6f0e2";

// Text colour used on light brand colours (Mira's ink green).
const INK = "#0f2a22";
const WHITE = "#ffffff";

// A colour this close to white would disappear against the white chat panel
// (focus rings, borders, the typing indicator).
const MIN_CONTRAST_ON_WHITE = 1.5;

// Body text on a custom background must be at least this readable (WCAG AA).
const MIN_TEXT_CONTRAST = 4.5;

/** Normalise "#0F2A22", "0f2a22" or "#abc" to "#rrggbb" (lowercase), or null if it isn't a hex colour. */
export function parseBrandColor(input: unknown): string | null {
  if (typeof input !== "string") return null;
  let value = input.trim().toLowerCase();
  if (value.startsWith("#")) value = value.slice(1);
  if (/^[0-9a-f]{3}$/.test(value)) value = value.split("").map((c) => c + c).join("");
  return /^[0-9a-f]{6}$/.test(value) ? `#${value}` : null;
}

function channels(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two #rrggbb colours, 1 (none) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** White or ink, whichever reads better on top of `hex`. */
export function readableTextOn(hex: string): string {
  return contrastRatio(hex, WHITE) >= contrastRatio(hex, INK) ? WHITE : INK;
}

/** Mix `hex` toward black by `amount` (0 to 1). Used for hover states. */
export function darken(hex: string, amount: number): string {
  const [r, g, b] = channels(hex).map((v) => Math.round(v * (1 - amount)));
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** Blend two #rrggbb colours: t=0 is `a`, t=1 is `b`. */
export function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = channels(a);
  const [br, bg, bb] = channels(b);
  const out = [ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t].map((v) => Math.round(v));
  return `#${out.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function rgba(hex: string, alpha: number): string {
  const [r, g, b] = channels(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** The colour cards, bubbles and the header sit on, derived from the page background. */
export function surfaceFor(background: string): string {
  return readableTextOn(background) === WHITE ? mix(background, WHITE, 0.08) : mix(background, WHITE, 0.6);
}

export type BrandColorCheck = { ok: true; color: string } | { ok: false; error: string };

/** Validate an owner's input before saving. */
export function checkBrandColor(input: unknown): BrandColorCheck {
  const color = parseBrandColor(input);
  if (!color) return { ok: false, error: "Enter a colour like #1a7f5a." };
  if (contrastRatio(color, WHITE) < MIN_CONTRAST_ON_WHITE) {
    return { ok: false, error: "That colour is too light to show up on a white chat. Pick something a little darker." };
  }
  return { ok: true, color };
}

export type BrandTheme = { accent: string; accentDark: string; onAccent: string };

/** Everything the chat needs from one brand colour. */
export function brandTheme(hex: string): BrandTheme {
  return { accent: hex, accentDark: darken(hex, 0.15), onAccent: readableTextOn(hex) };
}

export type ChatColorsCheck =
  | { ok: true; brand: string | null; background: string | null }
  | { ok: false; error: string };

function optionalColor(input: unknown): { value: string | null; invalid: boolean } {
  if (input === null || input === undefined || (typeof input === "string" && input.trim() === "")) {
    return { value: null, invalid: false };
  }
  const parsed = parseBrandColor(input);
  return { value: parsed, invalid: parsed === null };
}

/**
 * Validate the owner's two colours together (either can be empty = Mira's default).
 * The brand colour must stand out from whatever it sits on, so the check depends on
 * whether a custom background is set.
 */
export function checkChatColors(input: { brand: unknown; background: unknown }): ChatColorsCheck {
  const brand = optionalColor(input.brand);
  const background = optionalColor(input.background);
  if (brand.invalid) return { ok: false, error: "Enter the brand colour like #1a7f5a." };
  if (background.invalid) return { ok: false, error: "Enter the background colour like #fafafa." };

  if (background.value) {
    // Mid-tones (a medium grey, say) can't carry readable text in either white or dark.
    if (contrastRatio(mix(background.value, readableTextOn(background.value), 0.76), background.value) < MIN_TEXT_CONTRAST) {
      return { ok: false, error: "Text wouldn't be easy to read on that background. Pick a lighter or a darker one." };
    }
    const accent = brand.value ?? DEFAULT_BRAND_COLOR;
    const surface = surfaceFor(background.value);
    if (contrastRatio(accent, background.value) < MIN_CONTRAST_ON_WHITE || contrastRatio(accent, surface) < MIN_CONTRAST_ON_WHITE) {
      return {
        ok: false,
        error: brand.value
          ? "Your brand colour is too close to the background. Customers' messages wouldn't stand out. Pick a different brand colour or background."
          : "Pick a brand colour that stands out from this background.",
      };
    }
  } else if (brand.value) {
    const checked = checkBrandColor(brand.value);
    if (!checked.ok) return checked;
  }
  return { ok: true, brand: brand.value, background: background.value };
}

/**
 * CSS variables for the chat's root element, or undefined when nothing is customised.
 * Tailwind utilities and the glass classes read these, so one style attribute re-skins
 * the whole chat. A background also re-derives the text greys, borders and input
 * surfaces from that background, so dark and light backgrounds both stay readable.
 */
export function chatThemeVars(brand: string | null, background: string | null): Record<string, string> | undefined {
  const vars: Record<string, string> = {};
  if (brand) {
    const t = brandTheme(brand);
    vars["--color-accent"] = t.accent;
    vars["--color-accent-dark"] = t.accentDark;
    vars["--color-on-accent"] = t.onAccent;
  }
  if (background) {
    const ink = readableTextOn(background);
    const surface = surfaceFor(background);
    const ramp = (t: number) => mix(background, ink, t);
    vars["--mira-wash"] = background;
    vars["--mira-surface-strong"] = rgba(surface, 0.97);
    vars["--mira-surface-soft"] = rgba(surface, 0.82);
    vars["--mira-surface-hover"] = rgba(surface, 0.95);
    vars["--mira-line"] = rgba(ink, 0.14);
    vars["--color-white"] = surface;
    vars["--color-teal-900"] = ink;
    vars["--color-slate-200"] = ramp(0.14);
    vars["--color-slate-300"] = ramp(0.28);
    vars["--color-slate-400"] = ramp(0.48);
    vars["--color-slate-500"] = ramp(0.64);
    vars["--color-slate-600"] = ramp(0.76);
    vars["--color-slate-700"] = ramp(0.88);
    vars["color"] = ink;
  }
  return Object.keys(vars).length ? vars : undefined;
}
