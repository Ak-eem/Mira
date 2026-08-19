// Shared transport for both Gemini calls (plain chat replies and
// Command Center's function-calling). Provider selection is controlled by
// AI_PROVIDER, with Groq as the default and Gemini as the fallback.
const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent";
const GEMINI_STREAM_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:streamGenerateContent?alt=sse";
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

const TIMEOUT_MS = 10_000;
const RETRY_DELAY_MS = 600;
// llama-3.3-70b-versatile was deprecated by Groq (announced June 2026) --
// every request was 404ing, silently falling through to the Gemini
// fallback, which then timed out for a real fraction of users too. This
// is Groq's own recommended replacement for that exact model.
const GROQ_MODEL = "openai/gpt-oss-120b";

type ProviderName = "gemini" | "groq";

type AttemptResult =
  | { ok: true; data: unknown; provider: ProviderName }
  | { ok: false; retryable: boolean; message: string; provider: ProviderName };

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

function buildGroqPayload(body: unknown): Record<string, unknown> {
  const payload = isRecord(body) ? body : {};
  const contents = Array.isArray(payload.contents) ? payload.contents : [];
  const systemInstruction = isRecord(payload.system_instruction)
    ? payload.system_instruction
    : undefined;
  const messages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }> = [];

  const systemText = extractTextFromParts(
    isRecord(systemInstruction) ? systemInstruction.parts : undefined,
  );
  if (systemText) messages.push({ role: "system", content: systemText });

  for (const entry of contents) {
    if (!isRecord(entry)) continue;
    const role = entry.role === "model" ? "assistant" : "user";
    const text = extractTextFromParts(entry.parts);
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
      groqPayload.tool_choice = "auto";
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

  if (toolCalls.length > 0) {
    const firstToolCall = isRecord(toolCalls[0]) ? toolCalls[0] : undefined;
    const functionInfo = isRecord(firstToolCall?.function) ? firstToolCall.function : undefined;
    let parsedArgs: Record<string, unknown> = {};

    if (typeof functionInfo?.arguments === "string") {
      try {
        parsedArgs = JSON.parse(functionInfo.arguments) as Record<string, unknown>;
      } catch {
        parsedArgs = {};
      }
    }

    return {
      candidates: [
        {
          content: {
            parts: [
              {
                functionCall: {
                  name:
                    typeof functionInfo?.name === "string"
                      ? functionInfo.name
                      : "",
                  args: parsedArgs,
                },
              },
            ],
          },
        },
      ],
    };
  }

  const text = typeof message?.content === "string" ? message.content : "";
  return { candidates: [{ content: { parts: [{ text }] } }] };
}

async function attemptGemini(
  apiKey: string,
  body: unknown,
): Promise<AttemptResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(GEMINI_API_URL, {
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
      };
    }
    return {
      ok: false,
      retryable: true,
      message: "Couldn't reach the AI. Please try again.",
      provider: "gemini",
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function attemptGroq(
  apiKey: string,
  body: unknown,
): Promise<AttemptResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(buildGroqPayload(body)),
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
      };
    }
    return {
      ok: false,
      retryable: true,
      message: "Couldn't reach the AI. Please try again.",
      provider: "groq",
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
): Promise<AttemptResult> {
  return provider === "groq"
    ? attemptGroq(apiKey, body)
    : attemptGemini(apiKey, body);
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
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

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
      throw new Error(
        "The assistant is temporarily unavailable. Please try again.",
      );
    }

    yield* readSseStream(response, extractGeminiStreamText);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("The AI took too long to respond. Please try again.");
    }
    if (error instanceof Error) throw error;
    throw new Error("Couldn't reach the AI. Please try again.");
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function* groqFetchStream(
  apiKey: string,
  body: unknown,
): AsyncGenerator<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

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
      throw new Error(
        "The assistant is temporarily unavailable. Please try again.",
      );
    }

    yield* readSseStream(response, extractGroqStreamText);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("The AI took too long to respond. Please try again.");
    }
    if (error instanceof Error) throw error;
    throw new Error("Couldn't reach the AI. Please try again.");
  } finally {
    clearTimeout(timeoutId);
  }
}

// One retry after a short delay is retained for transient failures. When the
// configured primary provider remains retryable, the other provider is used as
// the fallback path so customer-facing replies remain available.
export async function geminiFetchJson(
  apiKey: string,
  body: unknown,
): Promise<unknown> {
  const primary: ProviderName =
    process.env.AI_PROVIDER === "gemini" ? "gemini" : "groq";
  const primaryKey =
    primary === "groq"
      ? process.env.GROQ_API_KEY?.trim()
      : apiKey.trim() || process.env.LLM_API_KEY?.trim();

  if (!primaryKey) {
    throw new Error(
      primary === "groq"
        ? "GROQ_API_KEY is not set."
        : "LLM_API_KEY is not set.",
    );
  }

  const first = await attemptProvider(primary, primaryKey, body);
  if (first.ok) return first.data;
  if (!first.retryable) throw new Error(first.message);

  await waitForRetry();
  const second = await attemptProvider(primary, primaryKey, body);
  if (second.ok) return second.data;
  if (!second.retryable) throw new Error(second.message);

  const fallback: ProviderName = primary === "groq" ? "gemini" : "groq";
  const fallbackKey =
    fallback === "groq"
      ? process.env.GROQ_API_KEY?.trim()
      : process.env.LLM_API_KEY?.trim() || apiKey.trim();

  if (fallbackKey) {
    console.warn(`${primary} request failed; trying ${fallback} fallback.`);
    const fallbackResult = await attemptProvider(fallback, fallbackKey, body);
    if (fallbackResult.ok) return fallbackResult.data;
    throw new Error(fallbackResult.message);
  }

  throw new Error(second.message);
}

export function __testBuildGroqPayload(body: unknown): unknown {
  return buildGroqPayload(body);
}

export function __testParseGroqResponse(data: unknown): unknown {
  return parseGroqResponse(data);
}
