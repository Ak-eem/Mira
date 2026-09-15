import { fetchUrl, htmlToText } from "@/lib/ai/urlFetch";
import { geminiFetchJson } from "@/lib/ai/geminiFetch";

export const MAX_IMPORT_PAGES = 50;
const PAGE_TIMEOUT_MS = 10_000;
const MAX_PAGE_TEXT = 30_000;
const MAX_PROMPT_TEXT = 120_000;

type ImageAsset = { src: string; alt: string };
export type CrawledPage = {
  url: string;
  text: string;
  images: ImageAsset[];
  ogImage: string | null;
};

export type ExtractedSiteData = {
  products: Array<Record<string, unknown>>;
  services: Array<Record<string, unknown>>;
  faqs: Array<Record<string, unknown>>;
  policies: Array<Record<string, unknown>>;
  contact: Record<string, unknown>;
  businessInfo: Record<string, unknown>;
  business_hours: Array<Record<string, unknown>>;
};

function getAttribute(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
}

function resolveHttpUrl(value: string | null, baseUrl: string): string | null {
  if (!value) return null;
  try {
    const resolved = new URL(value.trim(), baseUrl);
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return null;
    resolved.hash = "";
    return resolved.toString();
  } catch {
    return null;
  }
}

function sameOrigin(candidate: string, origin: URL): boolean {
  try {
    const url = new URL(candidate);
    return url.protocol === origin.protocol && url.host === origin.host;
  } catch {
    return false;
  }
}

function normalizedPageUrl(value: string, origin: URL): string | null {
  const resolved = resolveHttpUrl(value, origin.toString());
  if (!resolved || !sameOrigin(resolved, origin)) return null;
  const url = new URL(resolved);
  if (/\\.(?:css|js|json|xml|pdf|zip|png|jpe?g|gif|webp|svg|ico|mp4|mp3|woff2?)(?:$|\\?)/i.test(url.pathname)) return null;
  return url.toString();
}

function pageLinks(html: string, pageUrl: string, origin: URL): string[] {
  const links = new Set<string>();
  const anchorPattern = /<a\\b[^>]*\\bhref\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))[^>]*>/gi;
  for (const match of html.matchAll(anchorPattern)) {
    const link = normalizedPageUrl(match[1] ?? match[2] ?? match[3] ?? "", origin);
    if (link) links.add(link);
  }
  return [...links];
}

function pageImages(html: string, pageUrl: string): { images: ImageAsset[]; ogImage: string | null } {
  const images: ImageAsset[] = [];
  const seen = new Set<string>();
  for (const match of html.matchAll(/<img\\b[^>]*>/gi)) {
    const tag = match[0];
    const src = resolveHttpUrl(getAttribute(tag, "src"), pageUrl);
    if (!src || seen.has(src)) continue;
    seen.add(src);
    images.push({ src, alt: getAttribute(tag, "alt")?.trim() ?? "" });
  }

  let ogImage: string | null = null;
  for (const match of html.matchAll(/<meta\\b[^>]*(?:property|name)\\s*=\\s*(?:"og:image"|'og:image'|og:image)[^>]*>/gi)) {
    ogImage = resolveHttpUrl(getAttribute(match[0], "content"), pageUrl);
    if (ogImage) break;
  }
  return { images, ogImage };
}

async function fetchPageHtml(url: string): Promise<string> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      fetchUrl(url).then(async (response) => {
        if (!response.ok) throw new Error("page fetch failed");
        const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
        if (contentType && !contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
          throw new Error("page is not html");
        }
        return response.text();
      }),
      new Promise<string>((_, reject) => {
        timer = setTimeout(() => reject(new Error("page timeout")), PAGE_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function crawlSite(inputUrl: string): Promise<CrawledPage[]> {
  const origin = new URL(inputUrl);
  if (origin.protocol !== "http:" && origin.protocol !== "https:") throw new Error("invalid url");
  origin.hash = "";
  const firstUrl = normalizedPageUrl(origin.toString(), origin);
  if (!firstUrl) throw new Error("invalid url");

  const queue = [firstUrl];
  const queued = new Set(queue);
  const pages: CrawledPage[] = [];
  while (queue.length > 0 && pages.length < MAX_IMPORT_PAGES) {
    const url = queue.shift() as string;
    try {
      const html = await fetchPageHtml(url);
      const imageData = pageImages(html, url);
      pages.push({
        url,
        text: htmlToText(html, url).slice(0, MAX_PAGE_TEXT),
        images: imageData.images,
        ogImage: imageData.ogImage,
      });
      for (const link of pageLinks(html, url, origin)) {
        if (queued.size >= MAX_IMPORT_PAGES) break;
        if (!queued.has(link)) {
          queued.add(link);
          queue.push(link);
        }
      }
    } catch {
      // A single unavailable page must not fail the whole same-origin crawl.
    }
  }
  if (pages.length === 0) throw new Error("no pages fetched");
  return pages;
}

function extractionSchema() {
  const object = {
    type: "object",
    additionalProperties: false,
    properties: {
      name: { type: "string" },
      description: { type: "string" },
      price: { type: ["number", "string", "null"] },
      image_url: { type: ["string", "null"] },
      question: { type: "string" },
      answer: { type: "string" },
      title: { type: "string" },
      content: { type: "string" },
      day_of_week: { type: ["integer", "string", "null"] },
      opens_at: { type: ["string", "null"] },
      closes_at: { type: ["string", "null"] },
      email: { type: "string" },
      phone: { type: "string" },
      address: { type: "string" },
      tagline: { type: "string" },
    },
  };
  return {
    type: "object",
    additionalProperties: false,
    required: ["products", "services", "faqs", "policies", "contact", "businessInfo", "business_hours"],
    properties: {
      products: { type: "array", items: object },
      services: { type: "array", items: object },
      faqs: { type: "array", items: object },
      policies: { type: "array", items: object },
      contact: object,
      businessInfo: object,
      business_hours: { type: "array", items: object },
    },
  };
}

function modelText(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const record = data as Record<string, unknown>;
  const candidates = record.candidates;
  if (Array.isArray(candidates)) {
    const first = candidates[0];
    if (first && typeof first === "object") {
      const content = (first as Record<string, unknown>).content;
      if (content && typeof content === "object") {
        const parts = (content as Record<string, unknown>).parts;
        if (Array.isArray(parts)) return parts.map((part) => (part && typeof part === "object" && typeof (part as Record<string, unknown>).text === "string" ? (part as Record<string, unknown>).text : "")).join("");
      }
    }
  }
  const choices = record.choices;
  if (Array.isArray(choices)) {
    const message = choices[0] && typeof choices[0] === "object" ? (choices[0] as Record<string, unknown>).message : null;
    if (message && typeof message === "object" && typeof (message as Record<string, unknown>).content === "string") return (message as Record<string, unknown>).content as string;
  }
  return "";
}

function normalizeExtracted(value: unknown): ExtractedSiteData {
  const object = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const array = (key: string) => Array.isArray(object[key]) ? object[key].filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
  const record = (key: string) => object[key] && typeof object[key] === "object" && !Array.isArray(object[key]) ? object[key] as Record<string, unknown> : {};
  return {
    products: array("products"),
    services: array("services"),
    faqs: array("faqs"),
    policies: array("policies"),
    contact: record("contact"),
    businessInfo: record("businessInfo"),
    business_hours: array("business_hours"),
  };
}

export async function extractSiteData(pages: CrawledPage[]): Promise<ExtractedSiteData> {
  const apiKey = process.env.GEMINI_API_KEY?.trim() || process.env.GROQ_API_KEY?.trim() || process.env.LLM_API_KEY?.trim();
  if (!apiKey) throw new Error("AI key is not configured");
  const source = pages.map((page) => JSON.stringify(page)).join("\n").slice(0, MAX_PROMPT_TEXT);
  const data = await geminiFetchJson(apiKey, {
    systemInstruction: {
      parts: [{ text: "You extract only facts explicitly present in the supplied website crawl. Return valid JSON only. Never invent prices, hours, contact details, policies, or business facts. Use empty arrays or empty objects when evidence is absent." }],
    },
    contents: [{ role: "user", parts: [{ text: `Extract products, services, FAQs, policies, contact, businessInfo, and business_hours from this crawl. Products must preserve a numeric price only when the site states one; otherwise use null. Include image_url only from resolved img src or og:image values in the crawl.\n\n${source}` }] }],
    generationConfig: {
      temperature: 0,
      responseMimeType: "application/json",
      responseSchema: extractionSchema(),
    },
  });
  const text = modelText(data).trim().replace(/^```json\\s*/i, "").replace(/\\s*```$/, "");
  if (!text) throw new Error("empty extraction");
  try {
    return normalizeExtracted(JSON.parse(text));
  } catch {
    throw new Error("invalid extraction json");
  }
}

export function isValidHttpUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2_000) return false;
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password;
  } catch {
    return false;
  }
}
