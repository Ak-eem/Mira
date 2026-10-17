// A failure from an AI provider that keeps the facts an admin needs (which provider, HTTP status, what the
// provider said) while the .message stays the friendly text shown to customers. Pure; no server imports.

export type ProviderFailureKind = "http" | "timeout" | "network" | "config" | "empty";
export type ProviderLabel = "groq" | "gemini";

export class AiProviderError extends Error {
  readonly provider: ProviderLabel;
  readonly kind: ProviderFailureKind;
  readonly status: number | null;
  /** What the provider (or each attempt) reported. For admins only, never shown to customers. */
  readonly detail: string | null;

  constructor(message: string, info: { provider: ProviderLabel; kind: ProviderFailureKind; status?: number | null; detail?: string | null }) {
    super(message);
    this.name = "AiProviderError";
    this.provider = info.provider;
    this.kind = info.kind;
    this.status = info.status ?? null;
    this.detail = info.detail ?? null;
  }
}

const MAX_DETAIL = 500;

/** Provider bodies are JSON like {"error":{"message":"..."}}: keep just the useful sentence, bounded. */
export function summarizeProviderBody(body: string): string {
  const text = body.trim();
  if (!text) return "";
  try {
    const parsed = JSON.parse(text) as unknown;
    const candidates = Array.isArray(parsed) ? parsed : [parsed];
    for (const item of candidates) {
      const err = typeof item === "object" && item !== null ? (item as Record<string, unknown>).error : null;
      if (typeof err === "string") return err.slice(0, MAX_DETAIL);
      if (typeof err === "object" && err !== null && typeof (err as Record<string, unknown>).message === "string") return ((err as Record<string, string>).message).slice(0, MAX_DETAIL);
    }
  } catch {
    // not JSON: fall through to the raw text
  }
  return text.replace(/\s+/g, " ").slice(0, MAX_DETAIL);
}

/** Short machine code stored in ai_response_telemetry.error_code. */
export function errorCodeFor(error: unknown): string {
  if (error instanceof AiProviderError) {
    if (error.kind === "http") return error.status ? `http_${error.status}` : "http_error";
    if (error.kind === "timeout") return "timeout";
    if (error.kind === "network") return "network";
    if (error.kind === "config") return "not_configured";
    return "empty_response";
  }
  return error instanceof Error ? error.name : "unknown";
}

/** Stored in ai_response_telemetry.error_message; null when we have nothing beyond the code. */
export function errorDetailFor(error: unknown): string | null {
  if (error instanceof AiProviderError) return error.detail ?? error.message;
  if (error instanceof Error && error.message) return error.message.slice(0, MAX_DETAIL);
  return null;
}

export function providerFor(error: unknown): ProviderLabel | null {
  return error instanceof AiProviderError ? error.provider : null;
}

/** Plain-language explanation for the admin dashboard. */
export function explainAiError(code: string | null, provider: string): { title: string; hint: string } {
  const name = provider === "gemini" ? "Gemini" : "Groq";
  const c = code ?? "";
  if (c === "http_429") return { title: `${name} rate limit hit`, hint: "Too many requests or tokens for the plan. It clears by itself; if it keeps happening, upgrade the plan or lower traffic." };
  if (c === "http_401" || c === "http_403") return { title: `${name} rejected the API key`, hint: "The key is wrong, expired or not allowed. Check the key in your Vercel environment variables." };
  if (c === "http_400" || c === "http_404") return { title: `${name} rejected the request`, hint: "The model name or request format is not accepted. The model may have been renamed or retired." };
  if (/^http_5\d\d$/.test(c)) return { title: `${name} had a server error`, hint: "A provider outage. Nothing to fix on your side; Mira retries and falls back to the other provider." };
  if (c === "timeout") return { title: `${name} took too long`, hint: "The provider did not answer in time. Usually temporary." };
  if (c === "network") return { title: `Couldn't reach ${name}`, hint: "A network failure between Mira's server and the provider. Usually temporary." };
  if (c === "not_configured") return { title: `${name} API key is not set`, hint: "Add the key (GROQ_API_KEY or LLM_API_KEY) in Vercel environment variables and redeploy." };
  if (c === "empty_response") return { title: `${name} returned nothing`, hint: "The provider answered with an empty reply. Usually temporary." };
  return { title: "Unknown AI error", hint: "Recorded before error details were captured, so only a generic label exists. New failures will show the cause." };
}
