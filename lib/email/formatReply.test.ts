import { markdownToHtml, markdownToPlainText } from "./formatReply";

function check(condition: boolean, message: string): void {
  console.log(`${condition ? "PASS" : "FAIL"} - ${message}`);
  if (!condition) process.exitCode = 1;
}

const reply = [
  "Yes, we deliver.",
  "",
  "- **Within Lagos:** Dispatch delivery (price on request)",
  "- **Outside Lagos / Nationwide:** Waybill shipping to all 36 states",
  "",
  "Call **+234 903 698 1399** or visit [60 Iyalode Street](https://maps.example.com/?a=1&b=2).",
].join("\n");

const text = markdownToPlainText(reply);
check(!text.includes("**"), "plain text has no ** left");
check(text.includes("- Within Lagos: Dispatch delivery"), "plain text keeps the hyphen list, bold removed");
check(text.includes("60 Iyalode Street (https://maps.example.com/?a=1&b=2)"), "a markdown link becomes text (url)");
check(markdownToPlainText("[https://a.com](https://a.com)") === "https://a.com", "a link whose text is its url is not doubled");
check(markdownToPlainText("* one\n* two") === "- one\n- two", "asterisk bullets become hyphens");
check(markdownToPlainText("It is *very* good") === "It is very good", "single-asterisk emphasis is removed");
check(markdownToPlainText("2 * 3 * 4") === "2 * 3 * 4", "a maths asterisk is left alone");

const html = markdownToHtml(reply);
check(html.includes("<strong>Within Lagos:</strong>"), "html bolds the label");
check(html.includes("<ul") && html.split("<li").length - 1 === 2, "html makes a two-item list");
check(html.includes('<a href="https://maps.example.com/?a=1&amp;b=2">60 Iyalode Street</a>'), "html makes a link with an escaped url");
check(!html.includes("**"), "html has no ** left");

const hostile = markdownToHtml('<script>alert(1)</script> [x](javascript:alert(1)) "quoted"');
check(!hostile.includes("<script>"), "html escapes tags");
check(!/href="javascript:/i.test(hostile), "html never links a javascript: url");
check(markdownToHtml("one\ntwo").includes("one<br>two"), "single newlines become line breaks");
check(markdownToHtml("a\n\nb").split("<p").length - 1 === 2, "blank lines separate paragraphs");
check(markdownToHtml("See https://shop.example.com/x.").includes('<a href="https://shop.example.com/x">'), "a bare url becomes a link without the trailing dot");
