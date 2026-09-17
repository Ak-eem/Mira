import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import { Readable } from "node:stream";

const MAX_REDIRECTS = 5;
export const MAX_BODY_BYTES = 2 * 1024 * 1024;
const OVERALL_TIMEOUT_MS = 15_000;
const PER_HOP_TIMEOUT_MS = 5_000;
const SAFE_PORTS = new Set([80, 443]);

type PinnedAddress = { address: string; family: 4 | 6 };

const BLOCKED_IPV4_RANGES: readonly [number, number][] = [
  [0x00000000, 0x00ffffff], // "this" network / unspecified
  [0x0a000000, 0x0affffff], // private
  [0x64400000, 0x647fffff], // carrier-grade NAT
  [0x7f000000, 0x7fffffff], // loopback
  [0xa9fe0000, 0xa9feffff], // link-local and cloud metadata
  [0xac100000, 0xac1fffff], // private
  [0xc0000000, 0xc00000ff], // IETF protocol assignments
  [0xc0000200, 0xc00002ff], // TEST-NET-1
  [0xc0586300, 0xc05863ff], // deprecated 6to4 anycast
  [0xc0a80000, 0xc0a8ffff], // private (192.168.0.0/16)
  [0xc6120000, 0xc613ffff], // benchmarking
  [0xc6336400, 0xc63364ff], // TEST-NET-2
  [0xcb007100, 0xcb0071ff], // TEST-NET-3
  [0xe0000000, 0xefffffff], // multicast
  [0xf0000000, 0xffffffff], // reserved
  [0x646464c8, 0x646464c8], // Alibaba cloud metadata service
];

function ipv4ToNumber(octets: readonly number[]): number {
  return octets[0] * 0x1000000 + octets[1] * 0x10000 + octets[2] * 0x100 + octets[3];
}

export function isPublicIpv4(address: string): boolean {
  const octets = address.split(".").map(Number);
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return false;
  }

  const value = ipv4ToNumber(octets);
  return !BLOCKED_IPV4_RANGES.some(([start, end]) => value >= start && value <= end);
}

function parseIpv6Groups(value: string): number[] | null {
  if (!value) return [];

  const groups = value.split(":");
  const parsed: number[] = [];
  for (const [index, group] of groups.entries()) {
    if (group.includes(".")) {
      if (index !== groups.length - 1 || !isPublicIpv4(group)) {
        const octets = group.split(".").map(Number);
        if (
          index !== groups.length - 1 ||
          octets.length !== 4 ||
          octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
        ) {
          return null;
        }
        parsed.push((octets[0] << 8) | octets[1], (octets[2] << 8) | octets[3]);
        continue;
      }

      const octets = group.split(".").map(Number);
      parsed.push((octets[0] << 8) | octets[1], (octets[2] << 8) | octets[3]);
      continue;
    }

    if (!/^[0-9a-f]{1,4}$/i.test(group)) return null;
    parsed.push(Number.parseInt(group, 16));
  }
  return parsed;
}

function parseIpv6(address: string): number[] | null {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];
  if (isIP(normalized) !== 6) return null;

  const separator = normalized.indexOf("::");
  if (separator !== normalized.lastIndexOf("::")) return null;

  if (separator === -1) {
    const groups = parseIpv6Groups(normalized);
    return groups?.length === 8 ? groups : null;
  }

  const left = parseIpv6Groups(normalized.slice(0, separator));
  const right = parseIpv6Groups(normalized.slice(separator + 2));
  if (!left || !right) return null;

  const missing = 8 - left.length - right.length;
  if (missing < 1) return null;
  return [...left, ...new Array<number>(missing).fill(0), ...right];
}

function ipv6InRange(groups: readonly number[], prefix: readonly number[], bits: number): boolean {
  const completeGroups = Math.floor(bits / 16);
  for (let index = 0; index < completeGroups; index += 1) {
    if (groups[index] !== prefix[index]) return false;
  }

  const remainder = bits % 16;
  return remainder === 0 || (groups[completeGroups] >> (16 - remainder)) === (prefix[completeGroups] >> (16 - remainder));
}

export function isPublicIpv6(address: string): boolean {
  const groups = parseIpv6(address);
  if (!groups) return false;

  const isIpv4Mapped = groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;
  const isIpv4Compatible = groups.slice(0, 6).every((group) => group === 0);
  if (isIpv4Mapped || isIpv4Compatible) {
    const mappedIpv4 = [groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff];
    return isPublicIpv4(mappedIpv4.join("."));
  }

  return ![
    [0x0000, 0x0000, 0x0000, 0x0000], // unspecified
    [0x0000, 0x0000, 0x0000, 0x0001], // loopback
    [0xfc00, 0x0000, 0x0000, 0x0000], // unique-local (fc00::/7)
    [0xfe80, 0x0000, 0x0000, 0x0000], // link-local (fe80::/10)
    [0xfec0, 0x0000, 0x0000, 0x0000], // deprecated site-local
    [0xff00, 0x0000, 0x0000, 0x0000], // multicast
    [0x2001, 0x0db8, 0x0000, 0x0000], // documentation
    [0x2001, 0x0002, 0x0000, 0x0000], // benchmarking
    [0x2001, 0x0010, 0x0000, 0x0000], // ORCHID
    [0x0100, 0x0000, 0x0000, 0x0000], // discard-only (100::/64)
  ].some((prefix, index) => {
    const bits = index === 2 ? 7 : index === 3 ? 10 : index === 4 ? 10 : index === 5 ? 8 : index === 6 ? 32 : index === 7 ? 48 : index === 8 ? 28 : index === 9 ? 64 : 128;
    return ipv6InRange(groups, prefix, bits);
  });
}

// Resolve the hostname ONCE and validate every returned address. The validated
// address is returned so the caller can pin the subsequent socket connection.
export async function resolvePinnedAddress(hostname: string): Promise<PinnedAddress> {
  const normalizedHostname = hostname.replace(/^\[|\]$/g, "");
  const literalFamily = isIP(normalizedHostname);
  if (literalFamily === 4 || literalFamily === 6) {
    const isAllowed = literalFamily === 4 ? isPublicIpv4(normalizedHostname) : isPublicIpv6(normalizedHostname);
    if (!isAllowed) throw new Error("URL resolves to a private or reserved address.");
    return { address: normalizedHostname, family: literalFamily };
  }

  const addresses = await dns.lookup(normalizedHostname, { all: true, verbatim: true });
  const validAddress = addresses.find(({ address, family }) =>
    family === 4 ? isPublicIpv4(address) : family === 6 && isPublicIpv6(address),
  );
  if (!validAddress) throw new Error("URL resolves to a private or reserved address.");
  return { address: validAddress.address, family: validAddress.family };
}

function combineSignals(overallSignal: AbortSignal, hopSignal: AbortSignal): AbortSignal {
  return AbortSignal.any([overallSignal, hopSignal]);
}

// Connect to the already-validated IP while retaining the original hostname
// for the Host header and HTTPS certificate/SNI validation.
export function requestPinned(
  url: URL,
  pinned: PinnedAddress,
  signal: AbortSignal,
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const isHttps = url.protocol === "https:";
    const port = url.port ? Number(url.port) : isHttps ? 443 : 80;
    const lookup: NonNullable<http.RequestOptions["lookup"]> = (_hostname, _options, callback) => {
      callback(null, pinned.address, pinned.family);
    };
    const requestOptions: http.RequestOptions = {
      hostname: pinned.address,
      port,
      path: `${url.pathname}${url.search}` || "/",
      method: "GET",
      headers: { Host: url.host },
      signal,
      lookup,
    };

    if (isHttps) {
      const servername = url.hostname.replace(/^\[|\]$/g, "");
      if (isIP(servername) === 0) {
        (requestOptions as https.RequestOptions).servername = servername;
      }
    }

    const request = (isHttps ? https : http).request(requestOptions, (response) => {
      const headers = new Headers();
      for (const [key, value] of Object.entries(response.headers)) {
        if (value === undefined) continue;
        for (const item of Array.isArray(value) ? value : [value]) headers.append(key, item);
      }

      const body = Readable.toWeb(response) as ReadableStream<Uint8Array>;
      resolve(new Response(body, {
        status: response.statusCode ?? 0,
        statusText: response.statusMessage ?? "",
        headers,
      }));
    });

    request.on("error", reject);
    request.end();
  });
}

export async function readBoundedBody(response: Response): Promise<Uint8Array> {
  const declaredLength = response.headers.get("content-length");
  const parsedLength = declaredLength === null ? NaN : Number(declaredLength);
  if (Number.isFinite(parsedLength) && parsedLength > MAX_BODY_BYTES) {
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
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error("Only HTTP and HTTPS URLs are supported.");
      }
      if (url.username || url.password) throw new Error("URLs with credentials are not supported.");

      const port = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
      if (!SAFE_PORTS.has(port)) throw new Error("Only standard HTTP ports are supported.");

      const pinned = await resolvePinnedAddress(url.hostname);
      const hopController = new AbortController();
      const hopTimeout = setTimeout(() => hopController.abort(), PER_HOP_TIMEOUT_MS);
      let response: Response;
      try {
        response = await requestPinned(url, pinned, combineSignals(overallController.signal, hopController.signal));
      } finally {
        clearTimeout(hopTimeout);
      }

      if (response.status < 300 || response.status >= 400) {
        const body = await readBoundedBody(response);
        return new Response(body, {
          headers: response.headers,
          status: response.status,
          statusText: response.statusText,
        });
      }

      const location = response.headers.get("location");
      if (!location || redirectCount === MAX_REDIRECTS) {
        throw new Error("Too many redirects or missing redirect location.");
      }
      if (response.body) await response.body.cancel();
      currentUrl = new URL(location, url).toString();
    }
  } finally {
    clearTimeout(overallTimeout);
  }

  throw new Error("Too many redirects.");
}

export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function fetchText(input: string): Promise<string> {
  const response = await fetchUrl(input);
  if (!response.ok) throw new Error(`URL returned HTTP ${response.status}.`);
  const contentType = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "text/html" && contentType !== "text/plain") {
    throw new Error("URL must return text/html or text/plain content.");
  }
  const body = await response.text();
  return contentType === "text/html" ? htmlToText(body) : body;
}
