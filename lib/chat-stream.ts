/** Browser-side adapter for the `/api/chat` Server-Sent Events endpoint. */

export interface ChatRequest {
  businessSlug: string;
  message: string;
  visitorId?: string;
}

export interface ChatCompletion {
  done: true;
  messageId?: string;
  /** Server-defined product image payload; its shape is intentionally not assumed here. */
  productImages?: unknown;
  silent?: boolean;
}

export type ChatStreamEvent =
  | { type: "token"; token: string }
  | ({ type: "completion" } & ChatCompletion);

export interface ChatStreamOptions {
  signal?: AbortSignal;
  /** Optional fetch override, useful for callers that need a custom fetch implementation. */
  fetcher?: typeof fetch;
}

export class ChatStreamError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly payload?: unknown,
  ) {
    super(message);
    this.name = "ChatStreamError";
  }
}

/**
 * POST a chat request and yield parsed token/completion events. Pass `signal`
 * to abort the request; breaking out of iteration also cancels the response body.
 */
export async function* streamChat(
  request: ChatRequest,
  options: ChatStreamOptions = {},
): AsyncGenerator<ChatStreamEvent, void, void> {
  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher("/api/chat", {
    method: "POST",
    headers: {
      Accept: "text/event-stream",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
    signal: options.signal,
  });

  if (!response.ok) {
    const rawBody = await response.text();
    let payload: unknown = rawBody;
    try {
      payload = JSON.parse(rawBody) as unknown;
    } catch {
      // Keep non-JSON error bodies available as plain text.
    }
    throw new ChatStreamError(errorMessage(payload, response.status), response.status, payload);
  }

  if (!response.body) {
    throw new ChatStreamError("Chat response has no readable body", response.status);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parser = new SseFrameParser();
  let reachedEof = false;
  let completed = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        reachedEof = true;
        break;
      }

      for (const frame of parser.push(decoder.decode(value, { stream: true }))) {
        const event = parseEvent(frame);
        if (event.type === "completion") completed = true;
        yield event;
        if (completed) return;
      }
    }

    for (const frame of parser.push(decoder.decode(), true)) {
      const event = parseEvent(frame);
      if (event.type === "completion") completed = true;
      yield event;
      if (completed) return;
    }

    if (!completed) {
      throw new ChatStreamError("Chat stream ended before a completion event", response.status);
    }
  } finally {
    if (!reachedEof) {
      // Best-effort cancellation on abort, parse errors, or early iterator exit.
      await reader.cancel().catch(() => undefined);
    }
    reader.releaseLock();
  }
}

/** Incremental SSE framing: tolerates split chunks, CR/LF variants, and multi-line data fields. */
class SseFrameParser {
  private buffer = "";
  private dataLines: string[] = [];

  push(chunk: string, final = false): string[] {
    this.buffer += chunk;
    const frames: string[] = [];
    let lineStart = 0;

    for (let index = 0; index < this.buffer.length; index += 1) {
      const char = this.buffer[index];
      if (char !== "\n" && char !== "\r") continue;
      // A CR at a chunk boundary may be the first half of CRLF; wait for LF.
      if (char === "\r" && index === this.buffer.length - 1 && !final) break;

      this.consumeLine(this.buffer.slice(lineStart, index), frames);
      if (char === "\r" && this.buffer[index + 1] === "\n") index += 1;
      lineStart = index + 1;
    }

    this.buffer = this.buffer.slice(lineStart);
    if (final) {
      if (this.buffer.length > 0) this.consumeLine(this.buffer, frames);
      this.buffer = "";
      this.dispatch(frames);
    }
    return frames;
  }

  private consumeLine(line: string, frames: string[]): void {
    if (line === "") {
      this.dispatch(frames);
      return;
    }
    if (line.startsWith(":")) return; // SSE comment/heartbeat.

    const colon = line.indexOf(":");
    const field = colon < 0 ? line : line.slice(0, colon);
    let value = colon < 0 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "data") this.dataLines.push(value);
  }

  private dispatch(frames: string[]): void {
    if (this.dataLines.length > 0) frames.push(this.dataLines.join("\n"));
    this.dataLines = [];
  }
}

function parseEvent(frame: string): ChatStreamEvent {
  let payload: unknown;
  try {
    payload = JSON.parse(frame) as unknown;
  } catch {
    throw new ChatStreamError("Chat stream contained invalid JSON", undefined, frame);
  }

  if (!isRecord(payload)) {
    throw new ChatStreamError("Chat stream event must be a JSON object", undefined, payload);
  }
  if (typeof payload.token === "string") {
    return { type: "token", token: payload.token };
  }
  if (payload.done === true) {
    if (payload.messageId !== undefined && typeof payload.messageId !== "string") {
      throw new ChatStreamError("Chat completion messageId must be a string", undefined, payload);
    }
    if (payload.silent !== undefined && typeof payload.silent !== "boolean") {
      throw new ChatStreamError("Chat completion silent must be a boolean", undefined, payload);
    }
    return {
      type: "completion",
      done: true,
      ...(typeof payload.messageId === "string" ? { messageId: payload.messageId } : {}),
      ...(Object.hasOwn(payload, "productImages") ? { productImages: payload.productImages } : {}),
      ...(typeof payload.silent === "boolean" ? { silent: payload.silent } : {}),
    };
  }

  throw new ChatStreamError("Chat stream event was neither a token nor a completion", undefined, payload);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(payload: unknown, status: number): string {
  if (typeof payload === "string" && payload.trim()) return payload;
  if (isRecord(payload)) {
    for (const key of ["message", "error"] as const) {
      const value = payload[key];
      if (typeof value === "string" && value.trim()) return value;
      if (isRecord(value) && typeof value.message === "string" && value.message.trim()) {
        return value.message;
      }
    }
  }
  return `Chat request failed with status ${status}`;
}
