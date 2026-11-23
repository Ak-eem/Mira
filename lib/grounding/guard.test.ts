import { correctionNote, findUnsupportedFacts } from "./guard";

function check(condition: boolean, message: string): void {
  console.log(`${condition ? "PASS" : "FAIL"} - ${message}`);
  if (!condition) process.exitCode = 1;
}

const knowledge = [
  "Products: iPhone 15 - ₦1,450,000 (3 in stock). AirPods Pro - ₦230,000.",
  "Hours: Monday to Saturday 7:00 AM - 6:00 PM. Sunday closed.",
  "Contact: +234 903 698 1399, hello@shop.ng, https://shop.ng",
  "Delivery within Lagos costs ₦3,000.",
].join("\n");
const base = { knowledge, customerMessages: ["How much is the iPhone 15?"], businessName: "Shop", currency: "NGN" };

check(findUnsupportedFacts({ ...base, reply: "The iPhone 15 is ₦1,450,000 and we are open 7:00 AM to 6:00 PM." }).length === 0, "a reply built from the business's own facts passes");
const wrongPrice = findUnsupportedFacts({ ...base, reply: "The iPhone 15 is ₦1,200,000." });
check(wrongPrice.length === 1 && wrongPrice[0].type === "price", "an invented price is caught");
check(findUnsupportedFacts({ ...base, reply: "We open at 9:00 AM." }).some((s) => s.type === "time"), "a time that is not in the hours is caught");
check(findUnsupportedFacts({ ...base, reply: "Call us on +234 801 111 2222." }).some((s) => s.type === "contact"), "an invented phone number is caught");
check(findUnsupportedFacts({ ...base, reply: "Visit https://other-shop.com for that." }).some((s) => s.type === "link"), "an unknown link is caught");
check(findUnsupportedFacts({ ...base, reply: "Two AirPods Pro come to ₦460,000, plus ₦3,000 delivery is ₦463,000." }).length === 0, "quantity x price and a total with a known fee are accepted");
check(findUnsupportedFacts({ ...base, customerMessages: ["My budget is 500k"], reply: "Your ₦500,000 budget covers AirPods Pro at ₦230,000." }).length === 0, "a number the customer gave can be repeated back");
check(findUnsupportedFacts({ ...base, reply: "Yes, we offer a 2 year warranty on everything." }).length === 0, "a soft policy claim alone does not block (it is only flagged afterwards)");
check(findUnsupportedFacts({ ...base, reply: "I don't have that information for Shop yet. I'd recommend contacting them directly to confirm." }).length === 0, "the standard fallback reply never blocks");

const note = correctionNote(wrongPrice);
check(note.includes("₦1,200,000") && note.includes("ONLY facts"), "the correction note names the bad value and demands known facts only");
