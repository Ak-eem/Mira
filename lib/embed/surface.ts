// In the embedded widget the chat paints on top of the panel that embed.js draws (a translucent white
// shell). The chat may only go see-through when the owner has NOT picked a background colour. A custom
// background re-derives the whole palette from that colour (see chatThemeVars in lib/brandColor.ts), so a
// dark one gives light text; making that background transparent would put light text on the white shell.
export function embedUsesTransparentSurface(embedMode: boolean, backgroundColor: string | null | undefined): boolean {
  return embedMode && !backgroundColor;
}

// text-slate-900 is not re-mapped by a custom background (only slate-200 to slate-700 are), so on a custom
// background the embed's stronger text uses slate-700, which follows the owner's palette.
export function embedStrongTextClass(backgroundColor: string | null | undefined): string {
  return backgroundColor ? "text-slate-700" : "text-slate-900";
}

export function embedStrongHoverClass(backgroundColor: string | null | undefined): string {
  return backgroundColor ? "hover:text-slate-600" : "hover:text-black";
}
