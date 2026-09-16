import { extractReplyText } from "./parseInbound";

function check(condition: boolean, message: string): void {
  console.log(`${condition ? "PASS" : "FAIL"} - ${message}`);
  if (!condition) process.exitCode = 1;
}

check(
  extractReplyText("Thanks for the update.\n\n> Previous message\n> More history") === "Thanks for the update.",
  "strips quoted lines",
);
check(
  extractReplyText("I need help with my order.") === "I need help with my order.",
  "keeps an unquoted reply",
);
check(
  extractReplyText("Here is the answer.", "<p>Here is the answer.</p><blockquote>Old thread</blockquote>") === "Here is the answer.",
  "converts HTML-only email and strips its quote",
);