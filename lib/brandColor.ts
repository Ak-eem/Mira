// Brand colour for a business's customer-facing chat. Owners pick ONE colour; everything
// else (hover shade, readable text colour) is derived here so a business can't end up
// with unreadable buttons. Pure functions, safe to use on the server and in the browser.

export const DEFAULT_BRAND_COLOR = "#0f2a22";

// Text colour used on light brand colours (Mira's ink green).
const INK = "#0f2a22";
const WHITE = "#ffffff";

// A colour this close to white would disappear against the white chat panel
// (focus rings, borders, the typing indicator).
const MIN_CONTRAST_ON_WHITE = 1.5;

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
