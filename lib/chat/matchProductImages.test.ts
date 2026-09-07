import { matchProductImages } from "./matchProductImages";

const products = [
  { id: "coffee", name: "Coffee", image_url: "https://example.com/coffee.jpg" },
  { id: "iced-coffee", name: "Iced Coffee", image_url: "https://example.com/iced-coffee.jpg" },
  { id: "apple", name: "Green Apple", image_url: "https://example.com/apple.jpg" },
  { id: "pineapple", name: "Pineapple", image_url: "https://example.com/pineapple.jpg" },
];

function check(condition: boolean, message: string): void {
  console.log(`${condition ? "PASS" : "FAIL"} — ${message}`);
  if (!condition) process.exitCode = 1;
}

const exactAndWholeWord = matchProductImages("Try our iced coffee, please!", products);
check(exactAndWholeWord[0]?.productId === "iced-coffee", "prefers the longer exact product name");
check(exactAndWholeWord[1]?.productId === "coffee", "also matches the shorter whole-name product");

const plural = matchProductImages("We have green apples.", products);
check(plural[0]?.productId === "apple", "matches a plural form");

const noSubstring = matchProductImages("Our pineapple is fresh.", products);
check(noSubstring.length === 1 && noSubstring[0]?.productId === "pineapple", "does not match a name inside another word");

const capped = matchProductImages("Coffee, iced coffee, green apple, pineapple", [
  ...products,
  { id: "tea", name: "Tea", image_url: "https://example.com/tea.jpg" },
]);
check(capped.length === 3, "caps results at three images");

const skipsEmpty = matchProductImages("coffee", [
  { id: "empty", name: "   ", image_url: "https://example.com/empty.jpg" },
  { id: "missing", name: "Coffee", image_url: null },
  products[0],
]);
check(skipsEmpty.length === 1 && skipsEmpty[0]?.productId === "coffee", "skips empty names and missing images");
