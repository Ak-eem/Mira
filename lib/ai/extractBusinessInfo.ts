import { geminiFetchJson } from "./geminiFetch";
import type { ScrapeResult } from "./scrapeBusiness";

export type ScrapeKind = "product" | "service" | "policy" | "faq" | "business_hours" | "image";
export type ExtractedItem = { kind: ScrapeKind; payload: Record<string, unknown>; source_url: string | null };

const MAX_INPUT_CHARS = 40_000;
const MAX_ITEMS = 100;
const KINDS = new Set<ScrapeKind>(["product", "service", "policy", "faq", "business_hours"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, max = 2_000): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

function validateItem(value: unknown, allowedImageUrls: Set<string>, allowedSourceUrls: Set<string>): ExtractedItem | null {
  if (!isRecord(value) || typeof value.kind !== "string" || !KINDS.has(value.kind as ScrapeKind) || !isRecord(value.payload)) return null;
  const sourceUrl = typeof value.source_url === "string" && allowedSourceUrls.has(value.source_url) ? value.source_url : null;
  const payload = value.payload;
  if (value.kind === "product" || value.kind === "service") {
    const name = text(payload.name, 300);
    const description = text(payload.description, 4_000);
    const price = payload.price === null || payload.price === undefined ? null : typeof payload.price === "number" && Number.isFinite(payload.price) && payload.price >= 0 ? payload.price : null;
    if (!name || (value.kind === "product" && price === null)) return null;
    const candidateImageUrl = typeof payload.candidate_image_url === "string" && allowedImageUrls.has(payload.candidate_image_url)
      ? payload.candidate_image_url
      : null;
    return { kind: value.kind, payload: { name, description, price, ...(value.kind === "product" ? { candidate_image_url: candidateImageUrl } : {}) }, source_url: sourceUrl };
  }
  if (value.kind === "policy") {
    const title = text(payload.title, 300);
    const content = text(payload.content, 8_000);
    return title && content ? { kind: "policy", payload: { title, content }, source_url: sourceUrl } : null;
  }
  if (value.kind === "faq") {
    const question = text(payload.question, 500);
    const answer = text(payload.answer, 8_000);
    return question && answer ? { kind: "faq", payload: { question, answer }, source_url: sourceUrl } : null;
  }
  const dayOfWeek = typeof payload.day_of_week === "number" && Number.isInteger(payload.day_of_week) && payload.day_of_week >= 0 && payload.day_of_week <= 6 ? payload.day_of_week : null;
  const opensAt = payload.opens_at === null ? null : text(payload.opens_at, 20);
  const closesAt = payload.closes_at === null ? null : text(payload.closes_at, 20);
  return dayOfWeek !== null && (opensAt !== null || payload.opens_at === null) && (closesAt !== null || payload.closes_at === null)
    ? { kind: "business_hours", payload: { day_of_week: dayOfWeek, opens_at: opensAt, closes_at: closesAt }, source_url: sourceUrl }
    : null;
}

function responseText(value: unknown): string {
  if (!isRecord(value) || !Array.isArray(value.candidates)) return "";
  const candidate = isRecord(value.candidates[0]) ? value.candidates[0] : null;
  const content = candidate && isRecord(candidate.content) ? candidate.content : null;
  const parts = content && Array.isArray(content.parts) ? content.parts : [];
  return parts.map((part) => isRecord(part) && typeof part.text === "string" ? part.text : "").join("").trim();
}

function parseJson(value: unknown): unknown {
  if (Array.isArray(value)) return value;
  const raw = responseText(value).replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try { return JSON.parse(raw); } catch { return null; }
}

export async function extractBusinessInfo(scrape: ScrapeResult): Promise<ExtractedItem[]> {
  const pages = [...scrape.pages].sort((a, b) => (a.url === scrape.pages[0]?.url ? -1 : 0) - (b.url === scrape.pages[0]?.url ? -1 : 0));
  let remaining = MAX_INPUT_CHARS;
  const source = pages.map((page) => {
    const text = page.text.slice(0, remaining);
    remaining -= text.length;
    return `SOURCE: ${page.url}\n${text}`;
  }).filter(Boolean).join("\n\n");
  if (!source) return [];
  const allowedImageUrls = new Set(scrape.images);
  const allowedSourceUrls = new Set(scrape.pages.map((page) => page.url));
  const imageCandidates = scrape.images.length > 0 ? `\n\nCOLLECTED IMAGE CANDIDATES (use only when confidently near a product listing):\n${scrape.images.join("\n")}` : "";

  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) throw new Error("LLM_API_KEY is not set.");

  const data = await geminiFetchJson(apiKey, {
    system_instruction: { parts: [{ text: "Return only a JSON array. Never invent facts. Extract only information explicitly supported by the sources." }] },
    contents: [{ role: "user", parts: [{ text: `Extract candidate business information from these website pages. Each SOURCE-labeled block includes the exact page URL where its facts came from. Return ONLY a JSON array of {kind,payload,source_url}; source_url must be the exact URL from the relevant SOURCE label. Allowed kinds: product ({name,description,price,candidate_image_url}), service ({name,description,price}), policy ({title,content}), faq ({question,answer}), business_hours ({day_of_week,opens_at,closes_at}). For products, candidate_image_url is optional and must be one of the collected image candidates only; use null when no product image is confidently matched. Prices are numbers or null; day_of_week is 0 Sunday through 6 Saturday; use null for unknown opening or closing times.\n\n${source}${imageCandidates}` }] }],
    generation_config: { temperature: 0.1, response_mime_type: "application/json", max_output_tokens: 8_000 },
  });

  const parsed = parseJson(data);
  const items: unknown[] = Array.isArray(parsed) ? parsed : [];
  return items.map((item) => validateItem(item, allowedImageUrls, allowedSourceUrls)).filter((item): item is ExtractedItem => item !== null).slice(0, MAX_ITEMS);
}
