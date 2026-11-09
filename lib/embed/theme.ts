import { mix, parseBrandColor, readableTextOn } from "../brandColor";

// What /api/embed/status tells public/embed.js about colour. The widget is made of two layers
// that must agree: the shell embed.js draws on the customer's site (panel, controls strip) and the
// chat page inside the iframe. When only the iframe knew the owner's colours, a dark chat
// background put light text on embed.js's white shell. Now the shell is painted from the same
// colours, computed here with the same helpers the chat page uses, and sent ready to apply.
//
// Every value is a strict #rrggbb string (embed.js validates that before using it), and a field
// is left out when its source colour is unset or invalid, so embed.js keeps its own default.
export type EmbedTheme = {
  brandColor?: string;
  onBrandColor?: string;
  shellBackground?: string;
  shellInk?: string;
  shellSurface?: string;
  shellLine?: string;
};

export function embedTheme(brand: unknown, background: unknown): EmbedTheme {
  const theme: EmbedTheme = {};

  const brandColor = parseBrandColor(brand);
  if (brandColor) {
    theme.brandColor = brandColor;
    theme.onBrandColor = readableTextOn(brandColor);
  }

  const shellBackground = parseBrandColor(background);
  if (shellBackground) {
    const ink = readableTextOn(shellBackground);
    theme.shellBackground = shellBackground;
    theme.shellInk = ink;
    // Mixing toward the ink goes the right way on both light and dark backgrounds.
    theme.shellSurface = mix(shellBackground, ink, 0.08);
    theme.shellLine = mix(shellBackground, ink, 0.18);
  }

  return theme;
}
