import { isDeliveryConfirmation } from "./deliveryPhrase";
import { resolveOrderItems, type CatalogProduct } from "./resolveItems";
import { getOrderProblemReply, getOrderRecapReply } from "./orderReplies";

// Manual assertions in the same style as lib/ai/classifyIntent.test.ts --
// run with `npx tsx lib/orders/orders.test.ts`.

function check(label: string, pass: boolean) {
  console.log(`${pass ? "PASS" : "FAIL"} — ${label}`);
  if (!pass) process.exitCode = 1;
}

const catalog: CatalogProduct[] = [
  { id: "p1", name: "Red Ankara Dress", price: 15000, is_available: true, stock_quantity: 5 },
  { id: "p2", name: "Blue Ankara Dress", price: 16000, is_available: true, stock_quantity: null },
  { id: "p3", name: "Leather Sandals", price: 8000, is_available: true, stock_quantity: 2 },
  { id: "p4", name: "Gold Bag", price: 12000, is_available: false, stock_quantity: 3 },
  { id: "p5", name: "Silver Watch", price: 30000, is_available: true, stock_quantity: 0 },
];

// ---- delivery phrase: whole-message only
for (const yes of ["delivered", "Received", "I've received it", "i have received my order", "it arrived", "My order has been delivered.", "Yes, received!", "order received"]) {
  check(`delivery phrase matches "${yes}"`, isDeliveryConfirmation(yes));
}
for (const no of ["did my order get delivered?", "when will it be delivered", "not delivered yet", "I received the wrong size", "delivered where?", "can you deliver to Lekki"]) {
  check(`delivery phrase ignores "${no}"`, !isDeliveryConfirmation(no));
}

// ---- resolveOrderItems
const ok = resolveOrderItems([{ name: "leather sandals", quantity: 2 }], catalog);
check("exact (case-insensitive) match resolves with catalogue price", ok.ok && ok.total === 16000 && ok.items[0].product_id === "p3");

const partial = resolveOrderItems([{ name: "sandals", quantity: 1 }], catalog);
check("unique partial match resolves", partial.ok && partial.items[0].product_id === "p3");

const merged = resolveOrderItems([{ name: "Leather Sandals", quantity: 1 }, { name: "leather sandals", quantity: 1 }], catalog);
check("duplicate lines merge into one item", merged.ok && merged.items.length === 1 && merged.items[0].quantity === 2);

const ambiguous = resolveOrderItems([{ name: "ankara dress", quantity: 1 }], catalog);
check("ambiguous name asks instead of guessing", !ambiguous.ok && ambiguous.reason === "ambiguous" && (ambiguous.options?.length ?? 0) === 2);

check("unknown product is rejected", (() => { const r = resolveOrderItems([{ name: "Diamond Tiara", quantity: 1 }], catalog); return !r.ok && r.reason === "unknown"; })());
check("unavailable product is rejected", (() => { const r = resolveOrderItems([{ name: "Gold Bag", quantity: 1 }], catalog); return !r.ok && r.reason === "unavailable"; })());
check("out-of-stock product is rejected", (() => { const r = resolveOrderItems([{ name: "Silver Watch", quantity: 1 }], catalog); return !r.ok && r.reason === "unavailable"; })());
check("quantity above stock is rejected", (() => { const r = resolveOrderItems([{ name: "Leather Sandals", quantity: 3 }], catalog); return !r.ok && r.reason === "unavailable"; })());
check("merged quantity above stock is rejected", (() => { const r = resolveOrderItems([{ name: "Leather Sandals", quantity: 2 }, { name: "Leather Sandals", quantity: 1 }], catalog); return !r.ok && r.reason === "unavailable"; })());
check("fractional quantity is rejected", (() => { const r = resolveOrderItems([{ name: "Leather Sandals", quantity: 1.5 }], catalog); return !r.ok && r.reason === "invalid_quantity"; })());
check("zero quantity is rejected", (() => { const r = resolveOrderItems([{ name: "Leather Sandals", quantity: 0 }], catalog); return !r.ok && r.reason === "invalid_quantity"; })());
check("empty request is rejected", (() => { const r = resolveOrderItems([], catalog); return !r.ok && r.reason === "empty"; })());
check("model-supplied price/id fields cannot influence the result", (() => {
  const sneaky = [{ name: "Leather Sandals", quantity: 1, price: 1, product_id: "p1" }] as unknown as { name: string; quantity: number }[];
  const r = resolveOrderItems(sneaky, catalog);
  return r.ok && r.total === 8000 && r.items[0].product_id === "p3";
})());

// ---- deterministic replies
if (ok.ok) {
  const recap = getOrderRecapReply(ok.items, ok.total, "NGN", "Ada's Store");
  check("recap shows quantity, name, line total and total", recap.includes("2 × Leather Sandals") && recap.includes("₦16,000") && recap.includes("Reply YES"));
}
check("problem reply for ambiguous lists the options", (() => {
  const r = resolveOrderItems([{ name: "ankara dress", quantity: 1 }], catalog);
  return !r.ok && getOrderProblemReply(r).includes("Red Ankara Dress");
})());
