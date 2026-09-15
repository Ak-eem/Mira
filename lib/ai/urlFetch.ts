import dns from "node:dns/promises";

const MAX_REDIRECTS = 5;
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const OVERALL_TIMEOUT_MS = 10_000;
const PER_HOP_TIMEOUT_MS = 5_000;
const GENERIC_FETCH_ERROR = "Unable to fetch content from that URL.";
const GENERIC_READ_ERROR = "Unable to read content from that URL.";

function isGlobalIpv4(address: string): boolean {
  const octets = address.split(".").map(Number);
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return false;
  }

  const [first, second, third] = octets;
  if (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    first >= 224 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0) ||
    (first === 192 && second === 2) ||
    (first === 192 && second === 168) ||
    (first === 192 && second === 88 && third === 99) ||
    (first === 198 && second >= 18 && second <= 19) ||
    (first === 198 && second === 51 && third === 100) ||
    (first === 203 && second === 0 && third === 113)
  ) {
    return false;
  }

  return true;
}

function parseIpv6(address: string): number[] | null {
  let normalized = address.toLowerCase();
  if (normalized.includes("%")) return null;

  if (normalized.includes(".")) {
    const lastColon = normalized.lastIndexOf(":");
    if (lastColon < 0) return null;
    const ipv4 = normalized.slice(lastColon + 1).split(".").map(Number);
    if (
      ipv4.length !== 4 ||
      ipv4.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
    ) {
      return null;
    }
    const high = ((ipv4[0] << 8) | ipv4[1]).toString(16);
    const low = ((ipv4[2] << 8) | ipv4[3]).toString(16);
    normalized = `${normalized.slice(0, lastColon)}${high}:${low}`;
  }

  const halves = normalized.split("::");
  if (halves.length > 2) return null;

  const parseParts = (value: string): number[] => {
    if (!value) return [];
    const parts = value.split(":");
    if (parts.some((part) => !/^[0-9a-f]{1,4}$/i.test(part))) return [];
    return parts.map((part) => parseInt(part, 16));
  };

  const left = parseParts(halves[0]);
  const right = halves.length === 2 ? parseParts(halves[1]) : [];
  if ((halves[0] && left.length === 0) || (halves[1] && right.length === 0)) {
    return null;
  }

  if (halves.length === 1) {
    return left.length === 8 ? left : null;
  }

  const missing = 8 - left.length - right.length;
  if (missing < 1) return null;
  return [...left, ...new Array(missing).fill(0), ...right];
}

function isGlobalIpv6(address: string): boolean {
  const parts = parseIpv6(address);
  if (!parts) return false;

  const isIpv4Mapped =
    parts.slice(0, 5).every((part) => part === 0) && parts[5] === 0xffff;
  if (isIpv4Mapped) {
    return isGlobalIpv4(`${parts[6] >> 8}.${parts[6] & 0xff}.${parts[7] >> 8}.${parts[7] & 0xff}`);
  }

  const [first, second, third, fourth] = parts;
  if (first < 0x2000 || first > 0x3fff) return false;
  if (
    (first === 0x2001 &&
      (second === 0x0000 ||
        second === 0x0001 ||
        second === 0x0002 ||
        second === 0x0010 ||
        second === 0x0020 ||
        second === 0x0db8)) ||
    (first === 0x3fff && second === 0x0fff && third === 0xffff && fourth === 0xffff)
  ) {
    return false;
  }

  return true;
}

function isGlobalAddress(address: string): boolean {
  if (address.includes(":")) return isGlobalIpv6(address);
  return isGlobalIpv4(address);
}

async function assertGlobalHost(hostname: string): Promise<void> {
  const lookupHost = hostname.replace(/^\[|\]$/g, "");
  const addresses = await dns.lookup(lookupHost, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some(({ address }) => !isGlobalAddress(address))) {
    throw new Error(GENERIC_FETCH_ERROR);
  }
}

function validateUrl(input: string): URL {
  const url = new URL(input);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(GENERIC_FETCH_ERROR);
  }

  const authority = url.href.slice(url.protocol.length).split(/[\/?#]/, 1)[0];
  if (url.username || url.password || authority.includes("@")) {
    throw new Error(GENERIC_FETCH_ERROR);
  }
  if (!url.hostname || (url.port !== "" && url.port !== "80" && url.port !== "443")) {
    throw new Error(GENERIC_FETCH_ERROR);
  }

  return url;
}

function combineSignals(...signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  const abort = () => controller.abort();
  for (const signal of signals) {
    if (signal.aborted) {
      abort();
      break;
    }
    signal.addEventListener("abort", abort, { once: true });
  }
  return controller.signal;
}

async function resolveWithTimeout(hostname: string, signal: AbortSignal): Promise<void> {
  const timeout = new Promise<never>((_, reject) => {
    const timer = setTimeout(() => reject(new Error(GENERIC_FETCH_ERROR)), PER_HOP_TIMEOUT_MS);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new Error(GENERIC_FETCH_ERROR));
    }, { once: true });
  });

  await Promise.race([assertGlobalHost(hostname), timeout]);
}

async function readBoundedBody(response: Response): Promise<Uint8Array> {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength !== null) {
    const length = Number(declaredLength);
    if (Number.isFinite(length) && length > MAX_BODY_BYTES) {
      throw new Error(GENERIC_FETCH_ERROR);
    }
  }

  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) throw new Error(GENERIC_FETCH_ERROR);
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

async function fetchUrlInternal(input: string): Promise<Response> {
  const overallController = new AbortController();
  const overallTimeout = setTimeout(() => overallController.abort(), OVERALL_TIMEOUT_MS);
  let currentUrl = input;

  try {
    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
      const url = validateUrl(currentUrl);
      const hopController = new AbortController();
      const hopTimeout = setTimeout(() => hopController.abort(), PER_HOP_TIMEOUT_MS);
      try {
        await resolveWithTimeout(url.hostname, combineSignals(overallController.signal, hopController.signal));
        const response = await fetch(url, {
          redirect: "manual",
          signal: combineSignals(overallController.signal, hopController.signal),
        });

        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get("location");
          if (!location || redirectCount >= MAX_REDIRECTS) {
            throw new Error(GENERIC_FETCH_ERROR);
          }
          currentUrl = new URL(location, url).toString();
          continue;
        }

        const body = await readBoundedBody(response);
        return new Response(body, {
          headers: response.headers,
          status: response.status,
          statusText: response.statusText,
        });
      } finally {
        clearTimeout(hopTimeout);
      }
    }
  } finally {
    clearTimeout(overallTimeout);
  }

  throw new Error(GENERIC_FETCH_ERROR);
}

export async function fetchUrl(input: string): Promise<Response> {
  try {
    return await fetchUrlInternal(input);
  } catch {
    throw new Error(GENERIC_FETCH_ERROR);
  }
}

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    hellip: "…",
    nbsp: " ",
    lt: "<",
    quot: '"',
  };
  return value.replace(/&(#(?:x[\da-f]+|\d+)|[a-z][\da-z]+);/gi, (entity, key: string) => {
    if (key[0] === "#") {
      const code = key[1].toLowerCase() === "x" ? parseInt(key.slice(2), 16) : parseInt(key.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : entity;
    }
    return named[key.toLowerCase()] ?? entity;
  });
}

function stripMarkup(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]*>/g, " "));
}

export function htmlToText(html: string, baseUrl?: string): string {
  let text = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|template|svg|canvas|iframe|object|embed)[^>]*>[\s\S]*?<\/\1>/gi, " ");

  text = text.replace(/<a\b[^>]*href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi, (_match, _quote, rawHref: string, rawLabel: string) => {
    const label = stripMarkup(rawLabel).replace(/\s+/g, " ").trim();
    const href = decodeHtmlEntities(rawHref.trim());
    let target = href;
    try {
      if (baseUrl) target = new URL(href, baseUrl).toString();
    } catch {
      // Keep the original href when it is not a valid URL.
    }
    return label ? `${label} (${target})` : target;
  });

  text = text
    .replace(/<h[1-6][^>]*>/gi, "\n\n")
    .replace(/<\/h[1-6]\s*>/gi, "\n\n")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(p|div|section|article|header|footer|li|tr|blockquote|pre)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  return decodeHtmlEntities(text)
    .replace(/[ \t\r\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function fetchText(input: string): Promise<string> {
  try {
    const response = await fetchUrl(input);
    if (!response.ok) throw new Error(GENERIC_READ_ERROR);

    const contentType = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
    if (contentType !== "text/html" && contentType !== "text/plain" && contentType !== "application/xhtml+xml") {
      throw new Error(GENERIC_READ_ERROR);
    }

    const body = await response.text();
    return contentType === "text/plain" ? body.trim() : htmlToText(body, input);
  } catch {
    throw new Error(GENERIC_READ_ERROR);
  }
}
