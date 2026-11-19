// Where to scroll the chat so a new reply is in view. Pure (no DOM) so the rules are
// tested in scrollReveal.test.ts; ChatWindow reads the element sizes and applies the result.
//
// - A reply that fits comfortably is centred. Near the end of the conversation the browser
//   can't scroll past the bottom, so it simply ends up resting at the bottom edge.
// - A tall reply (most of the screen or more) lines its TOP up with the top of the chat, so
//   you start reading from the beginning instead of landing in the middle or at the end.
// - The result never goes below 0 or past the maximum scroll position.

export const TALL_RATIO = 0.85;
export const TOP_PADDING = 12;
// Within this many pixels of the bottom counts as "at the bottom": the chat keeps following
// the conversation. Scroll further up than this and it leaves you alone.
export const FOLLOW_THRESHOLD = 96;

export type RevealMode = "center" | "top";

export function computeReveal(input: {
  containerHeight: number;
  scrollHeight: number;
  elTop: number; // the reply's top edge, measured from the top of the scrollable content
  elHeight: number;
}): { top: number; mode: RevealMode } {
  const { containerHeight, scrollHeight, elTop, elHeight } = input;
  const max = Math.max(0, scrollHeight - containerHeight);
  const clamp = (value: number) => Math.min(max, Math.max(0, value));
  if (elHeight <= containerHeight * TALL_RATIO) {
    return { top: clamp(elTop - (containerHeight - elHeight) / 2), mode: "center" };
  }
  return { top: clamp(elTop - TOP_PADDING), mode: "top" };
}

export function distanceFromBottom(input: { scrollHeight: number; scrollTop: number; clientHeight: number }): number {
  return Math.max(0, input.scrollHeight - input.scrollTop - input.clientHeight);
}
