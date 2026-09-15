import dns from "node:dns/promises";

const MAX_REDIRECTS = 5;
export const MAX_BODY_BYTES = 2 * 1024 * 1024;
const OVERALL_TIMEOUT_MS = 15_000;
const PER_HOP_TIMEOUT_MS = 5_000;

export function isPublicIpv4(address: string): boolean {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return false;
  const [first, second] = octets;
  return first !== 0 && first !== 10 && !(first === 100 && second >= 64 && second <= 127) &&
    !(first === 127) && !(first === 169 && second === 254) &&
    !(first === 172 && second >= 16 && second <= 31) && !(first === 192 && second === 168) &&
    !(first >= 224);
}

export function isPublicIpv6(address: string): boolean {
  const normalized = address.toLowerCase().split("%")[0];
  if (!normalized.includes(":")) return false;
  const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mappedIpv4) return isPublicIpv4(mappedIpv4[1]);
  const groups = normalized.split(":");
  const firstGroup = Number.parseInt(groups[0] || "0", 16);
  const secondGroup = Number.parseInt(groups[1] || "0", 16);
  return normalized !== "::" && normalized !== "::1" &&
    !(normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb")) &&
    !(firstGroup >= 0xfc00 && firstGroup <= 0xfdff) &&
    !(firstGroup >= 0xff00 && firstGroup <= 0xffff) &&
    !(firstGroup === 0x2001 && secondGroup === 0x0db8) &&
    firstGroup !== 0x2002 && !(firstGroup === 0x2001 && secondGroup === 0);
}

export async function assertPublicHost(hostname: string): Promise<void> {
  const addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some(({ address }) => address.includes(":") ? !isPublicIpv6(address) : !isPublicIpv4(address))) {
    throw new Error("URL resolves to a private or reserved address.");
  }
}

function combineSignals(overallSignal: AbortSignal, hopSignal: AbortSignal): AbortSignal {
  return AbortSignal.any([overallSignal, hopSignal]);
}

export async function readBoundedBody(response: Response): Promise<Uint8Array> {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength !== null && Number(declaredLength) > MAX_BODY_BYTES) {
    throw new Error("Response is too large.");
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
      if (total > MAX_BODY_BYTES) throw new Error("Response is too large.");
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

export async function fetchUrl(input: string): Promise<Response> {
  const overallController = new AbortController();
  const overallTimeout = setTimeout(() => overallController.abort(), OVERALL_TIMEOUT_MS);
  let currentUrl = input;

  try {
    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
      const url = new URL(currentUrl);
      if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Only HTTP and HTTPS URLs are supported.");
      if (url.username || url.password) throw new Error("URLs with credentials are not supported.");
      if (url.port && url.port !== "80" && url.port !== "443") throw new Error("Only standard HTTP ports are supported.");
      await assertPublicHost(url.hostname);

      const hopController = new AbortController();
      const hopTimeout = setTimeout(() => hopController.abort(), PER_HOP_TIMEOUT_MS);
      let response: Response;
      try {
        response = await fetch(url, { redirect: "manual", signal: combineSignals(overallController.signal, hopController.signal) });
      } finally {
        clearTimeout(hopTimeout);
      }

      if (response.status < 300 || response.status >= 400) {
        const body = await readBoundedBody(response);
        const responseBody = new ArrayBuffer(body.byteLength);
        new Uint8Array(responseBody).set(body);
        return new Response(responseBody, { headers: response.headers, status: response.status, statusText: response.statusText });
      }
      const location = response.headers.get("location");
      if (!location || redirectCount === MAX_REDIRECTS) throw new Error("Too many redirects or missing redirect location.");
      currentUrl = new URL(location, url).toString();
    }
  } finally {
    clearTimeout(overallTimeout);
  }

  throw new Error("Too many redirects.");
}

export function htmlToText(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export async function fetchText(input: string): Promise<string> {
  const response = await fetchUrl(input);
  if (!response.ok) throw new Error(`URL returned HTTP ${response.status}.`);
  const contentType = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "text/html" && contentType !== "text/plain") throw new Error("URL must return text/html or text/plain content.");
  const body = await response.text();
  return contentType === "text/html" ? htmlToText(body) : body;
}