import { MAX_IMPORT_ROWS, type ImportParse, type ImportProblem, type ImportRow } from "@/lib/products/csvImport";

// Every Shopify store publishes its catalogue at <shop>/products.json. This turns that into the same rows the spreadsheet
// import uses, so the preview, the duplicate check and the database insert are shared. Pure (no network): the fetching
// lives in the server action, and this is unit-tested.

type ShopifyVariant = { title?: unknown; price?: unknown; available?: unknown };
type ShopifyOption = { name?: unknown; values?: unknown };
type ShopifyProduct = { title?: unknown; body_html?: unknown; variants?: unknown; options?: unknown; images?: unknown };

// 50 per page keeps each response well under the 2MB fetch cap even with long descriptions.
export const SHOPIFY_PAGE_SIZE = 50;
export const SHOPIFY_MAX_PAGES = 20;

// "maudilini.com", "https://www.maudilini.com/collections/all" -> "https://www.maudilini.com". Anything that is not a
// plain public web address returns null (the fetch itself is also blocked from private networks).
export function normalizeShopUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password) return null;
    if (!url.hostname.includes(".")) return null;
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

function plainText(html: unknown): string {
  if (typeof html !== "string") return "";
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|li|div|h[1-6])>/gi, ". ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;|&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .replace(/(\.\s*){2,}/g, ". ")
    .trim();
}

function toRow(product: ShopifyProduct, index: number): { row?: ImportRow; problem?: ImportProblem } {
  const line = index + 1;
  const name = typeof product.title === "string" ? product.title.replace(/\s+/g, " ").trim() : "";
  if (!name) return { problem: { line, message: "No title." } };

  const variants = (Array.isArray(product.variants) ? product.variants : []) as ShopifyVariant[];
  const prices = variants
    .map((v) => (typeof v.price === "string" || typeof v.price === "number" ? parseFloat(String(v.price)) : NaN))
    .filter((p) => Number.isFinite(p) && p >= 0);
  if (prices.length === 0) return { problem: { line, message: `"${name}" has no price.` } };

  const lowest = Math.min(...prices);
  const priceVaries = Math.max(...prices) !== lowest;

  // A product is sold out only when every variant is. Shopify's public feed does not expose counts, so stock stays blank.
  const knownAvailability = variants.filter((v) => typeof v.available === "boolean");
  const soldOut = knownAvailability.length > 0 && knownAvailability.every((v) => v.available === false);

  // "Size: S, M, L" style lines from the product's options, skipping Shopify's placeholder "Default Title".
  const options = (Array.isArray(product.options) ? product.options : []) as ShopifyOption[];
  const optionText = options
    .map((o) => {
      const values = Array.isArray(o.values) ? o.values.filter((v): v is string => typeof v === "string" && v !== "Default Title") : [];
      return typeof o.name === "string" && values.length > 0 ? `${o.name}: ${values.slice(0, 20).join(", ")}` : "";
    })
    .filter(Boolean)
    .join(". ");

  const description = [plainText(product.body_html).slice(0, 400), optionText ? `Options - ${optionText}` : "", priceVaries ? "Price shown is the lowest; it varies by option." : ""]
    .filter(Boolean)
    .join(" ")
    .slice(0, 600);

  const images = (Array.isArray(product.images) ? product.images : []) as { src?: unknown }[];
  const firstSrc = images.map((i) => i.src).find((src): src is string => typeof src === "string" && /^https:\/\//i.test(src));

  return {
    row: {
      name,
      description,
      price: Math.round(lowest * 100) / 100,
      stockQuantity: soldOut ? 0 : null,
      ...(firstSrc ? { imageUrl: firstSrc } : {}),
    },
  };
}

// `pages` is each page's parsed JSON body ({ products: [...] }) in order.
export function parseShopifyPages(pages: unknown[]): ImportParse {
  const all: ShopifyProduct[] = [];
  for (const page of pages) {
    const products = page && typeof page === "object" ? (page as { products?: unknown }).products : undefined;
    if (Array.isArray(products)) all.push(...(products as ShopifyProduct[]));
  }
  if (all.length === 0) return { rows: [], problems: [], fatal: "No products were found on that store." };

  const rows: ImportRow[] = [];
  const problems: ImportProblem[] = [];
  const seen = new Set<string>();
  all.forEach((product, index) => {
    const { row, problem } = toRow(product, index);
    if (problem) {
      problems.push(problem);
      return;
    }
    if (!row) return;
    const key = row.name.toLowerCase();
    if (seen.has(key)) {
      problems.push({ line: index + 1, message: `"${row.name}" appears more than once; kept the first.` });
      return;
    }
    seen.add(key);
    rows.push(row);
  });

  if (rows.length > MAX_IMPORT_ROWS) {
    return { rows: [], problems, fatal: `That store has ${rows.length} products. Import ${MAX_IMPORT_ROWS} or fewer at a time.` };
  }
  return { rows, problems, fatal: null };
}
