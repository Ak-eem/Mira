import { assertPublicHost, htmlToText, readBoundedBody } from "./urlFetch";

const MAX_PAGES = 8;
const MAX_IMAGES = 20;
const MAX_REDIRECTS = 5;
const CRAWL_TIMEOUT_MS = 30_000;
const PER_REQUEST_TIMEOUT_MS = 5_000;
const LINK_KEYWORDS = /about|product|shop|menu|service|price|pricing|policy|policies|shipping|return|refund|faq|contact|hours/i;

export type ScrapePage = { url: string; text: string };
export type ScrapeResult = { pages: ScrapePage[]; images: string[] };

function validateUrl(input: string): URL {
  const url = new URL(input);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Only HTTP and HTTPS URLs are supported.");
  if (url.username || url.password) throw new Error("URLs with credentials are not supported.");
  if (url.port && url.port !== "80" && url.port !== "443") throw new Error("Only standard HTTP ports are supported.");
  return url;
}

function sameOriginHostname(url: URL, startUrl: URL): boolean {
  return url.hostname.toLowerCase() === startUrl.hostname.toLowerCase();
}

function extractLinks(html: string, pageUrl: URL, startUrl: URL): string[] {
  const links: string[] = [];
  const pattern = /<a\b[^>]*href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(pattern)) {
    if (!LINK_KEYWORDS.test(`${match[2]} ${match[3].replace(/<[^>]+>/g, " ")}`)) continue;
    try {
      const target = validateUrl(new URL(match[2].trim(), pageUrl).toString());
      if (sameOriginHostname(target, startUrl)) links.push(target.toString());
    } catch {
      // Ignore malformed or unsafe links.
    }
  }
  return links;
}

function extractImages(html: string, pageUrl: URL, images: Set<string>): void {
  const add = (value: string) => {
    if (images.size >= MAX_IMAGES) return;
    try {
      const url = new URL(value.trim(), pageUrl);
      if (url.protocol === "http:" || url.protocol === "https:") images.add(url.toString());
    } catch {
      // Ignore malformed image URLs.
    }
  };

  for (const match of html.matchAll(/<img\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1/gi)) add(match[2]);
  for (const match of html.matchAll(/<meta\b[^>]*property\s*=\s*(["'])og:image\1[^>]*content\s*=\s*(["'])(.*?)\2/gi)) add(match[3]);
}

async function fetchPage(input: string, overallSignal: AbortSignal): Promise<{ url: string; html: string }> {
  const resource = await fetchCrawlResource(input, overallSignal);
  if (resource.status < 200 || resource.status >= 300) throw new Error(`Website returned HTTP ${resource.status}.`);
  if (resource.contentType !== "text/html" && resource.contentType !== "application/xhtml+xml" && resource.contentType !== "text/plain") {
    throw new Error("Website page is not HTML.");
  }
  return { url: resource.url, html: new TextDecoder().decode(resource.body) };
}

export async function fetchCrawlResource(input: string, overallSignal?: AbortSignal): Promise<{ url: string; status: number; contentType: string | null; body: Uint8Array }> {
  let currentUrl = input;
  const localController = overallSignal ? null : new AbortController();
  const signal = overallSignal ?? localController!.signal;
  const localTimeout = localController ? setTimeout(() => localController.abort(), PER_REQUEST_TIMEOUT_MS) : null;

  try {
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const url = validateUrl(currentUrl);
    await assertPublicHost(url.hostname);
    const requestController = new AbortController();
    const timeout = setTimeout(() => requestController.abort(), PER_REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, { redirect: "manual", signal: AbortSignal.any([signal, requestController.signal]) });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) throw new Error("Missing redirect location.");
        currentUrl = new URL(location, url).toString();
        continue;
      }
      const body = await readBoundedBody(response);
      return { url: url.toString(), status: response.status, contentType: response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() ?? null, body };
    } finally {
      clearTimeout(timeout);
    }
  }
  } finally {
    if (localTimeout) clearTimeout(localTimeout);
  }
  throw new Error("Too many redirects.");
}

export async function scrapeBusinessWebsite(startUrl: string): Promise<ScrapeResult> {
  const start = validateUrl(startUrl);
  const overallController = new AbortController();
  const overallTimeout = setTimeout(() => overallController.abort(), CRAWL_TIMEOUT_MS);
  const queue = [start.toString()];
  const visited = new Set<string>();
  const pages: ScrapePage[] = [];
  const images = new Set<string>();

  try {
    while (queue.length > 0 && pages.length < MAX_PAGES) {
      const next = queue.shift();
      if (!next || visited.has(next)) continue;
      visited.add(next);
      try {
        const page = await fetchPage(next, overallController.signal);
        const pageUrl = new URL(page.url);
        extractImages(page.html, pageUrl, images);
        pages.push({ url: page.url, text: htmlToText(page.html) });
        for (const link of extractLinks(page.html, pageUrl, start)) {
          if (!visited.has(link) && !queue.includes(link) && queue.length + pages.length < MAX_PAGES) queue.push(link);
        }
      } catch (error) {
        if (pages.length === 0) throw error;
      }
    }
  } finally {
    clearTimeout(overallTimeout);
  }

  return { pages, images: [...images] };
}
