import { parseCustomerFeedback } from "./parseFeedback";
import { isFeedbackReason } from "./reasons";

// Manual assertions, same style as the other lib tests --
// run with `npx tsx lib/feedback/feedback.test.ts`.

function check(label: string, pass: boolean) {
  console.log(`${pass ? "PASS" : "FAIL"} — ${label}`);
  if (!pass) process.exitCode = 1;
}

const id = "3f2b8a40-5c1d-4e6f-9a7b-0c1d2e3f4a5b";
const base = { messageId: id, businessSlug: "ada-store", visitorId: "3f2b8c1e-9a4d-4e7b-8d21-5c6a7b9e0f12" };

check("plain thumbs-up parses", (() => { const r = parseCustomerFeedback({ ...base, rating: "up" }); return r.ok && r.value.reason === null; })());
check("plain thumbs-down parses", (() => { const r = parseCustomerFeedback({ ...base, rating: "down" }); return r.ok && r.value.reason === null; })());
check("thumbs-down with a valid reason parses", (() => { const r = parseCustomerFeedback({ ...base, rating: "down", reason: "outdated" }); return r.ok && r.value.reason === "outdated"; })());
check("reason with a thumbs-up is rejected", !parseCustomerFeedback({ ...base, rating: "up", reason: "incorrect" }).ok);
check("unknown reason is rejected", !parseCustomerFeedback({ ...base, rating: "down", reason: "rude" }).ok);
check("null reason is treated as none", (() => { const r = parseCustomerFeedback({ ...base, rating: "down", reason: null }); return r.ok && r.value.reason === null; })());
check("missing visitorId is rejected (ownership can't be checked)", !parseCustomerFeedback({ messageId: id, businessSlug: "x", rating: "up" }).ok);
check("missing businessSlug is rejected", !parseCustomerFeedback({ messageId: id, visitorId: "v", rating: "up" }).ok);
check("non-uuid messageId is rejected", !parseCustomerFeedback({ ...base, messageId: "abc", rating: "up" }).ok);
check("bad rating is rejected", !parseCustomerFeedback({ ...base, rating: "meh" }).ok);
check("non-object body is rejected", !parseCustomerFeedback(null).ok && !parseCustomerFeedback("x").ok);
check("isFeedbackReason accepts all five codes", ["incorrect", "incomplete", "irrelevant", "outdated", "unclear"].every(isFeedbackReason));
check("isFeedbackReason rejects others", !isFeedbackReason("rude") && !isFeedbackReason(5) && !isFeedbackReason(undefined));
check("a guessable visitorId is rejected (it is the ownership credential)", !parseCustomerFeedback({ ...base, visitorId: "v-1", rating: "up" }).ok);
