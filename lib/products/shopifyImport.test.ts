import { normalizeShopUrl, parseShopifyPages } from "./shopifyImport";

function check(condition: boolean, message: string): void {
  console.log(`${condition ? "PASS" : "FAIL"} - ${message}`);
  if (!condition) process.exitCode = 1;
}

check(normalizeShopUrl("maudilini.com") === "https://maudilini.com", "a bare domain gets https");
check(normalizeShopUrl("https://www.russulboutique.com/collections/all?x=1") === "https://www.russulboutique.com", "a deep link is cut back to the shop");
check(normalizeShopUrl("  https://shop.example.ng/ ") === "https://shop.example.ng", "spaces and a trailing slash are ignored");
check(normalizeShopUrl("ftp://shop.example.com") === null, "non-web schemes are refused");
check(normalizeShopUrl("localhost") === null && normalizeShopUrl("hello world") === null && normalizeShopUrl("") === null, "single words, spaces and blanks are refused");
check(normalizeShopUrl("https://user:pw@shop.example.com") === null, "addresses with a password are refused");

const page = {
  products: [
    { title: "Classic White Shirt", images: [{ src: "http://insecure/x.jpg" }, { src: "https://cdn.shopify.com/s/files/shirt.jpg" }], body_html: "<p>Crisp cotton.<br>Slim fit &amp; breathable</p>", options: [{ name: "Size", values: ["S", "M", "L"] }], variants: [{ price: "19500.00", available: true }, { price: "21000.00", available: true }, { price: "19500.00", available: false }] },
    { title: "Leather Belt", body_html: "", options: [{ name: "Title", values: ["Default Title"] }], variants: [{ price: "8000.00", available: false }] },
    { title: "Free Gift", body_html: null, options: [], variants: [] },
    { title: "  ", variants: [{ price: "5" }] },
    { title: "classic white shirt", variants: [{ price: "1" }] },
  ],
};
const parsed = parseShopifyPages([page]);
check(parsed.fatal === null && parsed.rows.length === 2, "two usable products out of five");
const shirt = parsed.rows[0];
check(shirt.price === 19500, "the lowest variant price is used");
check(shirt.description.includes("Crisp cotton") && shirt.description.includes("Slim fit & breathable") && !shirt.description.includes("<"), "html becomes clean text");
check(shirt.description.includes("Options - Size: S, M, L") && shirt.description.includes("varies by option"), "options and a varying price are noted");
check(shirt.imageUrl === "https://cdn.shopify.com/s/files/shirt.jpg" && parsed.rows[1].imageUrl === undefined, "the first https photo is kept, others ignored")
check(shirt.stockQuantity === null, "a product with some variants available has no stock number");
check(parsed.rows[1].stockQuantity === 0 && !parsed.rows[1].description.includes("Default Title"), "all variants unavailable means sold out, placeholder option hidden");
check(parsed.problems.some((p) => p.message.includes("no price")), "a product with no variants is reported");
check(parsed.problems.some((p) => p.message.includes("No title")), "a blank title is reported");
check(parsed.problems.some((p) => p.message.includes("more than once")), "a duplicate name (any case) is reported");

check(parseShopifyPages([{ products: [] }]).fatal !== null, "an empty store is a clear error");
check(parseShopifyPages([{ error: "x" }, null, "nope"]).fatal !== null, "garbage pages are a clear error, not a crash");
const two = parseShopifyPages([{ products: [{ title: "A", variants: [{ price: "1" }] }] }, { products: [{ title: "B", variants: [{ price: "2" }] }] }]);
check(two.rows.length === 2, "products from several pages are combined");
