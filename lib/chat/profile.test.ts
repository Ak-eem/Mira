import { buildProfile, formatPrice, hoursTodayLabel, weeklyHours, MAX_DESCRIPTION_LENGTH, MAX_FAQS, MAX_POLICIES, MAX_PROFILE_PRODUCTS, MAX_PROMOTIONS } from "./profile";

let failures = 0;
function check(name: string, ok: boolean) {
  if (ok) console.log(`PASS - ${name}`);
  else { failures += 1; console.error(`FAIL - ${name}`); }
}
const weekdays = [1, 2, 3, 4, 5].map((d) => ({ day_of_week: d, opens_at: "09:00:00", closes_at: "18:00:00" }));
const MONDAY_10AM_LAGOS = new Date("2026-11-09T09:00:00Z"); // Lagos is UTC+1, no DST
const SUNDAY_NOON = new Date("2026-11-08T12:00:00Z");

// --- hours ---
check("hours: today's range", hoursTodayLabel(weekdays, "Africa/Lagos", MONDAY_10AM_LAGOS) === "9:00 AM – 6:00 PM");
check("hours: hours are set for other days but not today", hoursTodayLabel(weekdays, "Africa/Lagos", SUNDAY_NOON) === "Closed today");
check("hours: nothing set means nothing shown, not 'Closed'", hoursTodayLabel([], "Africa/Lagos", MONDAY_10AM_LAGOS) === null);
check("hours: rows without times count as not set", hoursTodayLabel([{ day_of_week: 1, opens_at: null, closes_at: null }], "Africa/Lagos", MONDAY_10AM_LAGOS) === null);
check("hours: a split day lists both ranges in order",
  hoursTodayLabel([{ day_of_week: 1, opens_at: "14:00:00", closes_at: "18:00:00" }, { day_of_week: 1, opens_at: "08:00:00", closes_at: "12:00:00" }], "Africa/Lagos", MONDAY_10AM_LAGOS) === "8:00 AM – 12:00 PM, 2:00 PM – 6:00 PM");
// 23:30 UTC on Monday is already 00:30 on Tuesday in Lagos. A Monday-only business is closed there, open in UTC.
const mondayOnly = [{ day_of_week: 1, opens_at: "09:00:00", closes_at: "18:00:00" }];
const lateMondayUtc = new Date("2026-11-09T23:30:00Z");
check("hours: 'today' is the business's own day, not the server's", hoursTodayLabel(mondayOnly, "Africa/Lagos", lateMondayUtc) === "Closed today" && hoursTodayLabel(mondayOnly, "UTC", lateMondayUtc) === "9:00 AM – 6:00 PM");
check("hours: an invalid timezone shows nothing instead of throwing", hoursTodayLabel(weekdays, "Not/AZone", MONDAY_10AM_LAGOS) === null);

// --- prices ---
check("price: naira", formatPrice(2500, "NGN") === "₦2,500");
check("price: a numeric string from the database", formatPrice("2500.00", "NGN") === "₦2,500");
check("price: keeps real decimals", formatPrice(12.5, "USD").includes("12.50"));
check("price: an unknown currency code falls back to plain text", formatPrice(1500, "ZZZZ") === "ZZZZ 1,500");
check("price: garbage gives an empty label", formatPrice("abc", "NGN") === "");

// --- the whole profile ---
const base = { description: null, currency: "NGN", timezone: "Africa/Lagos", socialLinks: null, hours: [], products: [], now: MONDAY_10AM_LAGOS };
check("a business with no details has no profile (it gets the plain chat page)", buildProfile(base) === null);
check("one detail is enough to show it", buildProfile({ ...base, description: "Fresh bread daily." })?.description === "Fresh bread daily.");

const long = "word ".repeat(200);
const clamped = buildProfile({ ...base, description: long })!.description!;
check(`description: cut to ${MAX_DESCRIPTION_LENGTH} characters at a word, with an ellipsis`, clamped.length <= MAX_DESCRIPTION_LENGTH + 1 && clamped.endsWith("…") && !clamped.endsWith(" …"));
check("description: whitespace and newlines are collapsed", buildProfile({ ...base, description: "  Fresh\n\n bread   daily.  " })?.description === "Fresh bread daily.");
check("description: blank text is no description", buildProfile({ ...base, description: "   \n " }) === null);

const links = buildProfile({ ...base, socialLinks: { instagram: "@adabakes", whatsapp: "+234 801 234 5678", website: "adabakes.com", facebook: "javascript:alert(1)", tiktok: "not a url" } })!.links;
check("links: handles and numbers become real links", links.some((l) => l.url === "https://instagram.com/adabakes") && links.some((l) => l.url.startsWith("https://wa.me/2348012345678")));
check("links: a bare domain gets https", links.some((l) => l.url === "https://adabakes.com"));
check("links: a javascript: value never becomes a link", !links.some((l) => /javascript/i.test(l.url)));
check("links: every link is a web address", links.every((l) => /^https?:\/\/[^/]+\.[^/]+/.test(l.url)));

const many = Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, name: `Item ${i}`, price: 1000 + i, image_url: null }));
check(`products: at most ${MAX_PROFILE_PRODUCTS}, in order`, (() => { const p = buildProfile({ ...base, products: many })!.products; return p.length === MAX_PROFILE_PRODUCTS && p[0].name === "Item 0"; })());
const odd = buildProfile({ ...base, products: [
  { id: "a", name: "  Sourdough ", price: "2500", image_url: "https://cdn.example.com/a.jpg" },
  { id: "b", name: "Bad image", price: 100, image_url: "javascript:alert(1)" },
  { id: "c", name: "", price: 100, image_url: null },
  { id: "d", name: "No price", price: null, image_url: null },
  { id: "e", name: "Broken price", price: "abc", image_url: null },
] })!.products;
check("products: names are trimmed and prices formatted", odd[0].name === "Sourdough" && odd[0].priceLabel === "₦2,500");
check("products: only http(s) images are kept", odd[0].imageUrl === "https://cdn.example.com/a.jpg" && odd[1].imageUrl === null);
check("products: nameless, priceless and unpriceable products are skipped", odd.length === 2);
check("currency: defaults to naira when the business has none set", buildProfile({ ...base, currency: null, products: [{ id: "x", name: "X", price: 500, image_url: null }] })!.products[0].priceLabel === "₦500");

// --- the whole week (left-hand panel) ---
const monFri = weeklyHours(weekdays, "Africa/Lagos", MONDAY_10AM_LAGOS)!;
check("week: Monday first, Sunday last", monFri.length === 7 && monFri[0].day === "Monday" && monFri[6].day === "Sunday");
check("week: exactly today is flagged, in the business's timezone", monFri.filter((r) => r.today).length === 1 && monFri[0].today === true);
check("week: days without hours read 'Closed'", monFri[5].hours === "Closed" && monFri[6].hours === "Closed" && monFri[0].hours === "9:00 AM – 6:00 PM");
check("week: Sunday is today on a Sunday", weeklyHours(weekdays, "Africa/Lagos", SUNDAY_NOON)![6].today === true);
check("week: no hours set means no week", weeklyHours([], "Africa/Lagos", MONDAY_10AM_LAGOS) === null);

// --- offers, FAQs, policies ---
const NOW = MONDAY_10AM_LAGOS;
const promos = buildProfile({ ...base, promotions: [
  { description: "10% off all loaves this week", starts_at: "2026-11-01T00:00:00Z", ends_at: "2026-11-30T00:00:00Z" },
  { description: "Open-ended offer", starts_at: null, ends_at: null },
  { description: "Expired offer", starts_at: "2026-10-01T00:00:00Z", ends_at: "2026-10-31T00:00:00Z" },
  { description: "Starts next month", starts_at: "2026-12-01T00:00:00Z", ends_at: null },
  { description: "   ", starts_at: null, ends_at: null },
  { description: "Third", starts_at: null, ends_at: null },
  { description: "Fourth (over the cap)", starts_at: null, ends_at: null },
] })!.promotions;
check("offers: only ones running today, blanks skipped", promos[0] === "10% off all loaves this week" && promos[1] === "Open-ended offer" && !promos.some((p) => /Expired|next month/.test(p)));
check(`offers: at most ${MAX_PROMOTIONS}`, promos.length === MAX_PROMOTIONS);
check("offers: a very long one is cut with an ellipsis", buildProfile({ ...base, promotions: [{ description: "sale ".repeat(100), starts_at: null, ends_at: null }] })!.promotions[0].endsWith("…"));
const faqs = buildProfile({ ...base, faqs: [{ question: "Do you deliver?" }, { question: "x".repeat(81) }, { question: "Hi" }, ...Array.from({ length: 8 }, (_, i) => ({ question: `Question number ${i}?` }))] })!.faqs;
check(`FAQs: too short and too long are skipped, at most ${MAX_FAQS}`, faqs[0] === "Do you deliver?" && faqs.length === MAX_FAQS && !faqs.includes("Hi"));
const policies = buildProfile({ ...base, policies: [{ title: "  Shipping & returns " }, { title: "" }, ...Array.from({ length: 9 }, (_, i) => ({ title: `Policy ${i}` }))] })!.policies;
check(`policies: tidy titles, blanks skipped, at most ${MAX_POLICIES}`, policies[0] === "Shipping & returns" && policies.length === MAX_POLICIES);
check("a business with only FAQs still has a panel", buildProfile({ ...base, faqs: [{ question: "Do you deliver?" }] }) !== null);
check("an offer outside its dates alone is not a reason to show anything", buildProfile({ ...base, promotions: [{ description: "Old", starts_at: null, ends_at: "2026-01-01T00:00:00Z" }] }) === null);
void NOW;

if (failures) { console.error(`${failures} check(s) failed`); process.exit(1); }
