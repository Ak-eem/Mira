import {
  geminiFetchJsonWithMetadata,
  geminiFetchStream,
  groqFetchStream,
} from "./geminiFetch";
import type { JsonFetchMetadata } from "./geminiFetch";

const MAX_OUTPUT_TOKENS = 2048;

type LlmMessage = { role: "user" | "assistant"; content: string };

function buildRequestBody(
  systemPrompt: string,
  messages: LlmMessage[],
): Record<string, unknown> {
  const contents = messages.map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: message.content }],
  }));

  return {
    contents,
    system_instruction: { parts: [{ text: systemPrompt }] },
    generation_config: { max_output_tokens: MAX_OUTPUT_TOKENS },
  };
}

function getProvider(): "gemini" | "groq" {
  return process.env.AI_PROVIDER === "gemini" ? "gemini" : "groq";
}

function getApiKey(provider: "gemini" | "groq"): string | undefined {
  return provider === "groq"
    ? process.env.GROQ_API_KEY?.trim()
    : process.env.LLM_API_KEY?.trim();
}

export async function generateReply(
  systemPrompt: string,
  messages: LlmMessage[],
): Promise<string> {
  const result = await generateReplyWithMetadata(systemPrompt, messages);
  return result.text;
}

export async function generateReplyWithMetadata(
  systemPrompt: string,
  messages: LlmMessage[],
): Promise<{ text: string; metadata: JsonFetchMetadata }> {
  const provider = getProvider();
  const apiKey = getApiKey(provider);

  if (!apiKey) {
    throw new Error(
      provider === "groq"
        ? "GROQ_API_KEY is not set."
        : "LLM_API_KEY is not set.",
    );
  }

  const result = await geminiFetchJsonWithMetadata(
    apiKey,
    buildRequestBody(systemPrompt, messages),
  );
  const data = result.data as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("The AI returned an unreadable response. Please try again.");
  }

  return { text, metadata: result.metadata };
}

export async function* generateReplyStream(
  systemPrompt: string,
  messages: LlmMessage[],
): AsyncGenerator<string> {
  const provider = getProvider();
  const apiKey = getApiKey(provider);

  if (!apiKey) {
    throw new Error(
      provider === "groq"
        ? "GROQ_API_KEY is not set."
        : "LLM_API_KEY is not set.",
    );
  }

  const body = buildRequestBody(systemPrompt, messages);
  const primaryStream =
    provider === "groq" ? groqFetchStream : geminiFetchStream;

  let yieldedToken = false;

  try {
    for await (const chunk of primaryStream(apiKey, body)) {
      yieldedToken = true;
      yield chunk;
    }

    if (yieldedToken) return;
  } catch (error) {
    if (yieldedToken) throw error;
  }

  const fallback = provider === "groq" ? "gemini" : "groq";
  const fallbackKey = getApiKey(fallback);

  if (!fallbackKey) {
    throw new Error(
      fallback === "groq"
        ? "GROQ_API_KEY is not set."
        : "LLM_API_KEY is not set.",
    );
  }

  const fallbackStream =
    fallback === "groq" ? groqFetchStream : geminiFetchStream;

  for await (const chunk of fallbackStream(fallbackKey, body)) {
    yieldedToken = true;
    yield chunk;
  }

  if (!yieldedToken) {
    throw new Error("The AI returned an unreadable response. Please try again.");
  }
}
