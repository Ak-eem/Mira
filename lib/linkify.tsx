import type { ReactNode } from "react";

const URL_SPLIT_PATTERN = /(https?:\/\/[^\s<>"')\]]+)/g;
const URL_TEST_PATTERN = /^https?:\/\//;

// Splits message text on bare https:// URLs and renders each as a real
// clickable link. Mira is now instructed (see buildPrompt.ts) to hand
// out contact/social links as plain URLs rather than markdown, and
// message bubbles were plain-text-only before this -- a URL just sat
// there unclickable. Deliberately simple, not a markdown parser: a
// business chat assistant only ever needs to emit a handful of links,
// never headers, bold text, or lists.
export function linkifyContent(text: string): ReactNode {
  return text.split(URL_SPLIT_PATTERN).map((part, i) =>
    URL_TEST_PATTERN.test(part) ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noreferrer noopener"
        className="underline underline-offset-2 hover:opacity-80"
      >
        {part}
      </a>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}
