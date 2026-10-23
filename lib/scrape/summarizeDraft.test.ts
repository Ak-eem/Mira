import { summarizeDraft } from "./summarizeDraft";

function check(condition: boolean, message: string): void {
  console.log(`${condition ? "PASS" : "FAIL"} - ${message}`);
  if (!condition) process.exitCode = 1;
}

function run() {
  const product = summarizeDraft("product", { name: "Ankara Shirt", price: 12500, description: "Cotton, sizes S-XL" });
  check(product.title === "Ankara Shirt", "a product is titled by its name");
  check(product.detail === "Price 12,500 · Cotton, sizes S-XL", "its detail combines price and description");
  check(summarizeDraft("product", { name: "Free sample", price: 0 }).detail === "Price 0", "a price of 0 is shown, not treated as missing");
  check(summarizeDraft("service", { name: "Haircut", price: null, description: null }).detail === null, "a service with no price or description has no detail line");

  const long = summarizeDraft("faq", { question: "Do you deliver?", answer: "x".repeat(300) });
  check(long.title === "Do you deliver?", "an FAQ is titled by its question");
  check(long.detail !== null && long.detail.length <= 120 && long.detail.endsWith("…"), "a long answer is clipped with an ellipsis");

  check(summarizeDraft("policy", { title: "Returns", content: "Within 7 days" }).title === "Returns", "a policy is titled by its title");

  check(summarizeDraft("business_hours", { day_of_week: 1, opens_at: "09:00", closes_at: "17:00" }).title === "Monday", "hours show the weekday name (1 = Monday)");
  check(summarizeDraft("business_hours", { day_of_week: 1, opens_at: "09:00", closes_at: "17:00" }).detail === "09:00 – 17:00", "and the opening range");
  check(summarizeDraft("business_hours", { day_of_week: 0, opens_at: null, closes_at: null }).detail === "Closed", "a day with no hours reads Closed");
  check(summarizeDraft("business_hours", { day_of_week: 9, opens_at: null, closes_at: null }).title === "Opening hours", "an out-of-range weekday falls back rather than rendering undefined");

  check(summarizeDraft("product", {}).title === "Unnamed product", "an empty product payload still gets a readable title");
  check(summarizeDraft("faq", null).title === "Question", "a null payload doesn't throw");
  check(summarizeDraft("faq", "not an object").title === "Question", "a string payload doesn't throw");
  check(summarizeDraft("faq", [1, 2]).title === "Question", "an array payload doesn't throw");
  check(summarizeDraft("image", { name: "Hero photo" }).title === "Hero photo", "an unrecognised kind uses a name if there is one");
  check(summarizeDraft("brand-new-kind", {}).title === "Suggested item", "and a generic label if there isn't, never blank");
}

run();
