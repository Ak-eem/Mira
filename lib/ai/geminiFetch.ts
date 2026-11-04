// Shared transport for both Gemini calls (plain chat replies and
// Command Center's function-calling). Provider selection is controlled by
// AI_PROVIDER, with Groq as the default and Gemini as the fallback.
import { AiProviderError, summarizeProviderBody, type ProviderFailureKind } from "./providerError";

const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent";
const GEMINI_STREAM_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:streamGenerateContent?alt=sse";
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

const TIMEOUT_MS = 10_000;
// Streaming: TIMEOUT_MS applies to getting response headers and to the gap
// between chunks (idle), not to the whole reply. STREAM_MAX_MS is the hard
// ceiling on total stream lifetime so a trickling provider can't hold a
// request open forever.
const STREAM_MAX_MS = 60_000;
const RETRY_DELAY_MS = 600;
// llama-3.3-70b-versatile was deprecated by Groq (announced June 2026) --
// every request was 404ing, silently falling through to the Gemini
// fallback, which then timed out for a real fraction of users too. This
// is Groq's own recommended replacement for that exact model.
const GROQ_MODEL = "openai/gpt-oss-120b";

export type ProviderName = "gemini" | "groq";

// Optional per-call overrides. Everything defaults to the constants above, so existing callers are unchanged.
export type FetchOptions = {
  // Absolute time (ms since epoch) after which no further attempt is started, and the
  // current one is cut short, so a caller can promise an overall time limit.
  deadlineAt?: number;
  timeoutMs?: number;
  groqModel?: string;
  geminiModel?: string;
};

const MIN_ATTEMPT_MS = 2_000;

function geminiUrl(model: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
}

function attemptTimeout(options?: FetchOptions): number {
  const base = options?.timeoutMs ?? TIMEOUT_MS;
  if (options?.deadlineAt === undefined) return base;
  return Math.max(1_000, Math.min(base, options.deadlineAt - Date.now()));
}

export type JsonFetchMetadata = {
  provider: ProviderName;
  fallbackFrom: ProviderName | null;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
};

type AttemptResult =
  | { ok: true; data: unknown; provider: ProviderName }
  | { ok: false; retryable: boolean; message: string; provider: ProviderName; kind: ProviderFailureKind; status?: number | null; detail?: string | null };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractTextFromParts(parts: unknown): string {
  if (!Array.isArray(parts)) return "";

  return parts
    .map((part) => {
      if (isRecord(part) && typeof part.text === "string") return part.text;
      return "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

// Reply text from a response's parts. A single model reply can arrive split
// across several text parts (and Gemini may prepend "thought" parts), so
// reading parts[0] alone truncates it. Parts are concatenated as-is -- the
// provider splits mid-text, so no separator is added.
export function extractReplyText(parts: unknown): string {
  if (!Array.isArray(parts)) return "";

  return parts
    .map((part) => {
      if (!isRecord(part) || part.thought === true) return "";
      return typeof part.text === "string" ? part.text : "";
    })
    .join("")
    .trim();
}

function buildGroqPayload(body: unknown): Record<string, unknown> {
  const payload = isRecord(body) ? body : {};
  const contents = Array.isArray(payload.contents) ? payload.contents : [];
  const systemInstruction = isRecord(payload.system_instruction)
    ? payload.system_instruction
    : undefined;
  type GroqToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
  const messages: Array<
    | { role: "system" | "user"; content: string }
    | { role: "assistant"; content: string | null; tool_calls?: GroqToolCall[] }
    | { role: "tool"; tool_call_id: string; content: string }
  > = [];

  const systemText = extractTextFromParts(
    isRecord(systemInstruction) ? systemInstruction.parts : undefined,
  );
  if (systemText) messages.push({ role: "system", content: systemText });

  // Tool turns. Gemini-shaped history has no call ids, but Groq (OpenAI format)
  // requires every tool result to name the call it answers, so ids are minted
  // here when a model turn's functionCall parts are converted, and handed out to
  // the following functionResponse parts (matched by name, then by order).
  const pendingCalls: Array<{ id: string; name: string }> = [];
  let callCounter = 0;

  for (const entry of contents) {
    if (!isRecord(entry)) continue;
    const role = entry.role === "model" ? "assistant" : "user";
    const parts = Array.isArray(entry.parts) ? entry.parts : [];
    const text = extractTextFromParts(entry.parts);

    const calls = parts.flatMap((part) => (isRecord(part) && isRecord(part.functionCall) ? [part.functionCall] : []));
    if (role === "assistant" && calls.length > 0) {
      const toolCalls: GroqToolCall[] = calls.map((call) => {
        const id = `call_${(callCounter += 1)}`;
        const name = typeof call.name === "string" ? call.name : "";
        pendingCalls.push({ id, name });
        return { id, type: "function", function: { name, arguments: JSON.stringify(isRecord(call.args) ? call.args : {}) } };
      });
      messages.push({ role: "assistant", content: text || null, tool_calls: toolCalls });
      continue;
    }

    const results = parts.flatMap((part) => (isRecord(part) && isRecord(part.functionResponse) ? [part.functionResponse] : []));
    if (results.length > 0) {
      for (const result of results) {
        const name = typeof result.name === "string" ? result.name : "";
        const at = pendingCalls.findIndex((call) => call.name === name);
        const [matched] = at >= 0 ? pendingCalls.splice(at, 1) : pendingCalls.splice(0, 1);
        if (!matched) continue;
        messages.push({ role: "tool", tool_call_id: matched.id, content: JSON.stringify(result.response ?? {}) });
      }
      if (text) messages.push({ role: "user", content: text });
      continue;
    }

    if (text) messages.push({ role, content: text });
  }

  const groqPayload: Record<string, unknown> = {
    model: GROQ_MODEL,
    messages,
    temperature: 0.2,
  };

  const generationConfig = isRecord(payload.generation_config)
    ? payload.generation_config
    : undefined;
  const maxOutputTokens =
    typeof generationConfig?.max_output_tokens === "number"
      ? generationConfig.max_output_tokens
      : undefined;
  if (maxOutputTokens !== undefined) {
    groqPayload.max_tokens = maxOutputTokens;
  }

  const tools = Array.isArray(payload.tools) ? payload.tools : [];
  if (tools.length > 0) {
    const convertedTools = tools.flatMap((tool) => {
      if (!isRecord(tool) || !Array.isArray(tool.function_declarations)) return [];
      return tool.function_declarations.flatMap((declaration) => {
        if (!isRecord(declaration)) return [];
        return [
          {
            type: "function",
            function: {
              name: typeof declaration.name === "string" ? declaration.name : "",
              description:
                typeof declaration.description === "string"
                  ? declaration.description
                  : "",
              parameters: isRecord(declaration.parameters)
                ? declaration.parameters
                : { type: "object", properties: {} },
            },
          },
        ];
      });
    });

    if (convertedTools.length > 0) {
      groqPayload.tools = convertedTools;
      // Gemini-style tool_config mode NONE ("answer in text, no more tool calls") maps to tool_choice "none".
      const toolConfig = isRecord(payload.tool_config) ? payload.tool_config : undefined;
      const calling = isRecord(toolConfig?.function_calling_config) ? toolConfig.function_calling_config : undefined;
      groqPayload.tool_choice = calling?.mode === "NONE" ? "none" : "auto";
    }
  }

  return groqPayload;
}

function parseGroqResponse(data: unknown): unknown {
  if (!isRecord(data)) {
    return { candidates: [{ content: { parts: [{ text: "" }] } }] };
  }

  const choice =
    Array.isArray(data.choices) && isRecord(data.choices[0])
      ? data.choices[0]
      : undefined;
  const message = isRecord(choice?.message) ? choice.message : undefined;
  const toolCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];

  const usage = isRecord(data.usage) ? data.usage : undefined;
  const usageMetadata = usage
    ? {
        promptTokenCount: typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : null,
        candidatesTokenCount: typeof usage.completion_tokens === "number" ? usage.completion_tokens : null,
      }
    : undefined;

  if (toolCalls.length > 0) {
    // Convert every tool call, not just the first -- the model can emit
    // several in one turn and dropping the rest silently loses actions.
    const parts = toolCalls.map((toolCall) => {
      const call = isRecord(toolCall) ? toolCall : undefined;
      const functionInfo = isRecord(call?.function) ? call.function : undefined;
      let parsedArgs: Record<string, unknown> = {};

      if (typeof functionInfo?.arguments === "string") {
        try {
          parsedArgs = JSON.parse(functionInfo.arguments) as Record<string, unknown>;
        } catch {
          parsedArgs = {};
        }
      }

      return {
        functionCall: {
          name: typeof functionInfo?.name === "string" ? functionInfo.name : "",
          args: parsedArgs,
        },
      };
    });

    return {
      candidates: [{ content: { parts } }],
      ...(usageMetadata ? { usageMetadata } : {}),
    };
  }

  const text = typeof message?.content === "string" ? message.content : "";
  return {
    candidates: [{ content: { parts: [{ text }] } }],
    ...(usageMetadata ? { usageMetadata } : {}),
  };
}

function getTokenUsage(data: unknown): { inputTokens: number | null; outputTokens: number | null } {
  if (!isRecord(data) || !isRecord(data.usageMetadata)) {
    return { inputTokens: null, outputTokens: null };
  }
  return {
    inputTokens: typeof data.usageMetadata.promptTokenCount === "number" ? data.usageMetadata.promptTokenCount : null,
    outputTokens: typeof data.usageMetadata.candidatesTokenCount === "number" ? data.usageMetadata.candidatesTokenCount : null,
  };
}

async function attemptGemini(
  apiKey: string,
  body: unknown,
  options?: FetchOptions,
): Promise<AttemptResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), attemptTimeout(options));

  try {
    const response = await fetch(options?.geminiModel ? geminiUrl(options.geminiModel) : GEMINI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error(`Gemini call failed (${response.status}): ${detail}`);
      return {
        ok: false,
        retryable: response.status >= 500 || response.status === 429,
        message: "The assistant is temporarily unavailable. Please try again.",
        provider: "gemini",
        kind: "http",
        status: response.status,
        detail: summarizeProviderBody(detail),
      };
    }

    return { ok: true, data: await response.json(), provider: "gemini" };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return {
        ok: false,
        retryable: true,
        message: "The AI took too long to respond. Please try again.",
        provider: "gemini",
        kind: "timeout",
      };
    }
    return {
      ok: false,
      retryable: true,
      message: "Couldn't reach the AI. Please try again.",
      provider: "gemini",
      kind: "network",
      detail: error instanceof Error ? error.message.slice(0, 200) : null,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function attemptGroq(
  apiKey: string,
  body: unknown,
  options?: FetchOptions,
): Promise<AttemptResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), attemptTimeout(options));

  try {
    const groqPayload = buildGroqPayload(body);
    if (options?.groqModel) groqPayload.model = options.groqModel;
    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(groqPayload),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error(`Groq call failed (${response.status}): ${detail}`);
      return {
        ok: false,
        retryable: response.status >= 500 || response.status === 429,
        message: "The assistant is temporarily unavailable. Please try again.",
        provider: "groq",
        kind: "http",
        status: response.status,
        detail: summarizeProviderBody(detail),
      };
    }

    return {
      ok: true,
      data: parseGroqResponse(await response.json()),
      provider: "groq",
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return {
        ok: false,
        retryable: true,
        message: "The AI took too long to respond. Please try again.",
        provider: "groq",
        kind: "timeout",
      };
    }
    return {
      ok: false,
      retryable: true,
      message: "Couldn't reach the AI. Please try again.",
      provider: "groq",
      kind: "network",
      detail: error instanceof Error ? error.message.slice(0, 200) : null,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function waitForRetry(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
}

async function attemptProvider(
  provider: ProviderName,
  apiKey: string,
  body: unknown,
  options?: FetchOptions,
): Promise<AttemptResult> {
  return provider === "groq"
    ? attemptGroq(apiKey, body, options)
    : attemptGemini(apiKey, body, options);
}

function extractGeminiStreamText(data: unknown): string {
  if (!isRecord(data)) return "";

  const candidates = Array.isArray(data.candidates) ? data.candidates : [];
  const candidate = isRecord(candidates[0]) ? candidates[0] : undefined;
  const content = isRecord(candidate?.content) ? candidate.content : undefined;

  if (!content) return "";
  return extractTextFromPartsWithoutTrim(content.parts);
}

function extractGroqStreamText(data: unknown): string {
  if (!isRecord(data)) return "";

  const choices = Array.isArray(data.choices) ? data.choices : [];
  const choice = isRecord(choices[0]) ? choices[0] : undefined;
  const delta = isRecord(choice?.delta) ? choice.delta : undefined;

  return typeof delta?.content === "string" ? delta.content : "";
}

function extractTextFromPartsWithoutTrim(parts: unknown): string {
  if (!Array.isArray(parts)) return "";

  return parts
    .map((part) => {
      if (isRecord(part) && typeof part.text === "string") return part.text;
      return "";
    })
    .filter(Boolean)
    .join("");
}

function parseSseEvent(
  event: string,
  extractText: (data: unknown) => string,
): { done: boolean; text: string } {
  const dataLines = event
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart());

  if (dataLines.length === 0) return { done: false, text: "" };

  const dataText = dataLines.join("\n").trim();
  if (!dataText) return { done: false, text: "" };
  if (dataText === "[DONE]") return { done: true, text: "" };

  const parsed = JSON.parse(dataText) as unknown;
  return { done: false, text: extractText(parsed) };
}

async function* readSseStream(
  response: Response,
  extractText: (data: unknown) => string,
  onActivity?: () => void,
): AsyncGenerator<string> {
  if (!response.body) {
    throw new Error("The AI returned an empty stream.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      onActivity?.();

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() ?? "";

      for (const event of events) {
        const parsed = parseSseEvent(event, extractText);
        if (parsed.done) return;
        if (parsed.text) yield parsed.text;
      }
    }

    buffer += decoder.decode();
    if (buffer.trim()) {
      const parsed = parseSseEvent(buffer, extractText);
      if (!parsed.done && parsed.text) yield parsed.text;
    }
  } finally {
    reader.releaseLock();
  }
}

export async function* geminiFetchStream(
  apiKey: string,
  body: unknown,
): AsyncGenerator<string> {
  const controller = new AbortController();
  // Idle timer: armed for the connection, re-armed on every chunk.
  let timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const touch = () => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  };
  const maxId = setTimeout(() => controller.abort(), STREAM_MAX_MS);

  try {
    const response = await fetch(GEMINI_STREAM_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error(`Gemini stream failed (${response.status}): ${detail}`);
      throw new AiProviderError(
        "The assistant is temporarily unavailable. Please try again.",
        { provider: "gemini", kind: "http", status: response.status, detail: summarizeProviderBody(detail) },
      );
    }

    touch();
    yield* readSseStream(response, extractGeminiStreamText, touch);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new AiProviderError("The AI took too long to respond. Please try again.", { provider: "gemini", kind: "timeout" });
    }
    if (error instanceof Error) throw error;
    throw new AiProviderError("Couldn't reach the AI. Please try again.", { provider: "gemini", kind: "network" });
  } finally {
    clearTimeout(timeoutId);
    clearTimeout(maxId);
  }
}

export async function* groqFetchStream(
  apiKey: string,
  body: unknown,
): AsyncGenerator<string> {
  const controller = new AbortController();
  // Idle timer: armed for the connection, re-armed on every chunk.
  let timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const touch = () => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  };
  const maxId = setTimeout(() => controller.abort(), STREAM_MAX_MS);

  try {
    const payload = {
      ...buildGroqPayload(body),
      stream: true,
    };

    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error(`Groq stream failed (${response.status}): ${detail}`);
      throw new AiProviderError(
        "The assistant is temporarily unavailable. Please try again.",
        { provider: "groq", kind: "http", status: response.status, detail: summarizeProviderBody(detail) },
      );
    }

    touch();
    yield* readSseStream(response, extractGroqStreamText, touch);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new AiProviderError("The AI took too long to respond. Please try again.", { provider: "groq", kind: "timeout" });
    }
    if (error instanceof Error) throw error;
    throw new AiProviderError("Couldn't reach the AI. Please try again.", { provider: "groq", kind: "network" });
  } finally {
    clearTimeout(timeoutId);
    clearTimeout(maxId);
  }
}

type FailedAttempt = Extract<AttemptResult, { ok: false }>;

function describeAttempt(result: FailedAttempt): string {
  if (result.kind === "http") return `${result.provider}: HTTP ${result.status ?? "?"}${result.detail ? ` - ${result.detail}` : ""}`;
  if (result.kind === "timeout") return `${result.provider}: timed out`;
  return `${result.provider}: ${result.kind}${result.detail ? ` - ${result.detail}` : ""}`;
}

// The customer sees result.message; admins get every attempt (primary, retry, fallback) in .detail.
function failureFrom(result: FailedAttempt, tried: string[]): AiProviderError {
  return new AiProviderError(result.message, { provider: result.provider, kind: result.kind, status: result.status, detail: tried.join(" | ") });
}

// One retry after a short delay is retained for transient failures. When the
// configured primary provider remains retryable, the other provider is used as
// the fallback path so customer-facing replies remain available.
export async function geminiFetchJsonWithMetadata(
  apiKey: string,
  body: unknown,
  preferredProvider?: ProviderName,
  options?: FetchOptions,
): Promise<{ data: unknown; metadata: JsonFetchMetadata }> {
  const startedAt = Date.now();
  const primary: ProviderName =
    preferredProvider ?? (process.env.AI_PROVIDER === "gemini" ? "gemini" : "groq");
  const primaryKey =
    primary === "groq"
      ? process.env.GROQ_API_KEY?.trim()
      : apiKey.trim() || process.env.LLM_API_KEY?.trim();

  if (!primaryKey) {
    const message = primary === "groq" ? "GROQ_API_KEY is not set." : "LLM_API_KEY is not set.";
    throw new AiProviderError(message, { provider: primary, kind: "config", detail: message });
  }

  const tried: string[] = [];
  const first = await attemptProvider(primary, primaryKey, body, options);
  if (first.ok) return { data: first.data, metadata: { provider: first.provider, fallbackFrom: null, latencyMs: Date.now() - startedAt, ...getTokenUsage(first.data) } };
  tried.push(describeAttempt(first));
  if (!first.retryable) throw failureFrom(first, tried);

  // With a deadline, don't start a retry that can't finish in time.
  if (options?.deadlineAt !== undefined && options.deadlineAt - Date.now() < MIN_ATTEMPT_MS + RETRY_DELAY_MS) throw failureFrom(first, tried);
  await waitForRetry();
  const second = await attemptProvider(primary, primaryKey, body, options);
  if (second.ok) return { data: second.data, metadata: { provider: second.provider, fallbackFrom: null, latencyMs: Date.now() - startedAt, ...getTokenUsage(second.data) } };
  tried.push(describeAttempt(second));
  if (!second.retryable) throw failureFrom(second, tried);

  const fallback: ProviderName = primary === "groq" ? "gemini" : "groq";
  const fallbackKey =
    fallback === "groq"
      ? process.env.GROQ_API_KEY?.trim()
      : process.env.LLM_API_KEY?.trim() || apiKey.trim();

  if (options?.deadlineAt !== undefined && options.deadlineAt - Date.now() < MIN_ATTEMPT_MS) throw failureFrom(second, tried);
  if (fallbackKey) {
    console.warn(`${primary} request failed; trying ${fallback} fallback.`);
    const fallbackResult = await attemptProvider(fallback, fallbackKey, body, options);
    if (fallbackResult.ok) return { data: fallbackResult.data, metadata: { provider: fallbackResult.provider, fallbackFrom: primary, latencyMs: Date.now() - startedAt, ...getTokenUsage(fallbackResult.data) } };
    tried.push(describeAttempt(fallbackResult));
    throw failureFrom(fallbackResult, tried);
  }

  throw failureFrom(second, tried);
}

export async function geminiFetchJson(apiKey: string, body: unknown, preferredProvider?: ProviderName): Promise<unknown> {
  const result = await geminiFetchJsonWithMetadata(apiKey, body, preferredProvider);
  return result.data;
}

export function __testBuildGroqPayload(body: unknown): unknown {
  return buildGroqPayload(body);
}

export function __testParseGroqResponse(data: unknown): unknown {
  return parseGroqResponse(data);
}
