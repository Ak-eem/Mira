import { htmlToText, readBoundedBody, requestPinned, resolvePinnedAddress } from "./urlFetch";

const MAX_PAGES = 8;
const MAX_IMAGES = 20;
const MAX_REDIRECTS = 5;
const CRAWL_TIMEOUT_MS = 30_000;
const PER_REQUEST_TIMEOUT_MS = 5_000;
const LINK_KEYWORDS = /about|product|shop|menu|service|price|pricing|policy|policies|shipping|return|refund|faq|contact|hours/i;

export type ScrapePage = {
  url: string;
  text: string;
};
export type ScrapeResult = {
  pages: ScrapePage[];
  images: string[];
};

function validateUrl(input: string): URL {
  const url = new URL(input);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only HTTP and HTTPS URLs are supported.");
  }
  if (url.username || url.password) {
    throw new Error("URLs with credentials are not supported.");
  }
  if (url.port && url.port !== "80" && url.port !== "443") {
    throw new Error("Only standard HTTP ports are supported.");
  }
  return url;
}

function sameOriginHostname(url: URL, originHostname: string): boolean {
  return url.hostname.toLowerCase() === originHostname.toLowerCase();
}

function extractLinks(html: string, pageUrl: URL, originHostname: string): string[] {
  const links: string[] = [];
  const pattern = /<a\b[^>]*href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(pattern)) {
    if (!LINK_KEYWORDS.test(`${match[2]} ${match[3].replace(/<[^>]+>/g, " ")}`)) continue;
    try {
      const target = validateUrl(new URL(match[2].trim(), pageUrl).toString());
      if (sameOriginHostname(target, originHostname)) links.push(target.toString());
    } catch {
      // Ignore malformed or unsafe links.
    }
  }
  return links;
}

function extractImages(html: string, pageUrl: URL, images: Set<string>, maxImages: number, originHostname: string): void {
  const add = (value: string) => {
    if (images.size >= maxImages) return;
    try {
      const url = validateUrl(new URL(value.trim(), pageUrl).toString());
      if ((url.protocol === "http:" || url.protocol === "https:") && sameOriginHostname(url, originHostname)) {
        images.add(url.toString());
      }
    } catch {
      // Ignore malformed, unsafe, or cross-origin image URLs.
    }
  };

  for (const match of html.matchAll(/<img\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1/gi)) add(match[2]);
  for (const match of html.matchAll(/<meta\b[^>]*property\s*=\s*(["'])og:image\1[^>]*content\s*=\s*(["'])(.*?)\2/gi)) add(match[3]);
}

async function fetchPage(
  input: string,
  overallSignal: AbortSignal,
  originHostname?: string,
): Promise<{ url: string; html: string }> {
  const resource = await fetchCrawlResource(input, overallSignal, originHostname);
  if (resource.status < 200 || resource.status >= 300) {
    throw new Error(`Website returned HTTP ${resource.status}.`);
  }
  if (
    resource.contentType !== "text/html" &&
    resource.contentType !== "application/xhtml+xml" &&
    resource.contentType !== "text/plain"
  ) {
    throw new Error("Website page is not HTML.");
  }
  return { url: resource.url, html: new TextDecoder().decode(resource.body) };
}

export async function fetchCrawlResource(
  input: string,
  overallSignal?: AbortSignal,
  originHostname?: string,
): Promise<{ url: string; status: number; contentType: string | null; body: Uint8Array }> {
  let currentUrl = input;
  const localController = overallSignal ? null : new AbortController();
  const signal = overallSignal ?? localController!.signal;
  const localTimeout = localController
    ? setTimeout(() => localController.abort(), PER_REQUEST_TIMEOUT_MS)
    : null;

  try {
    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
      const url = validateUrl(currentUrl);
      const pinned = await resolvePinnedAddress(url.hostname);
      const requestController = new AbortController();
      const timeout = setTimeout(() => requestController.abort(), PER_REQUEST_TIMEOUT_MS);
      try {
        const response = await requestPinned(
          url,
          pinned,
          AbortSignal.any([signal, requestController.signal]),
        );
        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get("location");
          if (!location) throw new Error("Missing redirect location.");
          const redirectUrl = validateUrl(new URL(location, url).toString());
          if (originHostname && !sameOriginHostname(redirectUrl, originHostname)) {
            throw new Error("Redirect leaves the website origin.");
          }
          currentUrl = redirectUrl.toString();
          continue;
        }
        const body = await readBoundedBody(response);
        return {
          url: url.toString(),
          status: response.status,
          contentType: response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() ?? null,
          body,
        };
      } finally {
        clearTimeout(timeout);
      }
    }
  } finally {
    if (localTimeout) clearTimeout(localTimeout);
  }
  throw new Error("Too many redirects.");
}

async function fetchImages(imageUrls: Iterable<string>, overallSignal: AbortSignal): Promise<string[]> {
  const fetchedImages: string[] = [];
  for (const imageUrl of imageUrls) {
    try {
      const resource = await fetchCrawlResource(imageUrl, overallSignal);
      if (resource.status < 200 || resource.status >= 300) continue;
      if (!resource.contentType?.startsWith("image/")) continue;
      fetchedImages.push(resource.url);
    } catch {
      // An individual image failure must not be reported as a fetched image.
    }
  }
  return fetchedImages;
}

export async function scrapeBusinessWebsite(startUrl: string): Promise<ScrapeResult> {
  const start = validateUrl(startUrl);
  let effectiveOriginHostname: string | undefined;
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
        const page = await fetchPage(next, overallController.signal, effectiveOriginHostname);
        const pageUrl = new URL(page.url);
        if (!effectiveOriginHostname) effectiveOriginHostname = pageUrl.hostname;
        const remainingImageBudget = MAX_IMAGES - images.size;
        if (remainingImageBudget > 0) {
          const candidates = extractImageUrls(page.html, pageUrl, remainingImageBudget, effectiveOriginHostname);
          for (const image of await fetchImages(candidates, overallController.signal)) {
            images.add(image);
          }
        }
        pages.push({ url: page.url, text: htmlToText(page.html) });
        for (const link of extractLinks(page.html, pageUrl, effectiveOriginHostname)) {
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

function extractImageUrls(html: string, pageUrl: URL, maxImages: number, originHostname: string): Set<string> {
  const images = new Set<string>();
  extractImages(html, pageUrl, images, maxImages, originHostname);
  return images;
}
