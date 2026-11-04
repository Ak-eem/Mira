// A bounded model <-> tools loop: the model may ask for read-only tools, the server runs them and hands the
// results back, and this repeats until the model answers in text. Provider-neutral: the history is
// Gemini-shaped (functionCall / functionResponse parts) and geminiFetch translates it for Groq.
//
// Every limit is a hard cap, because each model call costs money and time: model calls, tool calls per
// step, tool calls in total, and an overall deadline. A tool that throws never breaks the loop; the model
// is told it failed and can try something else or say it can't tell.
import { extractReplyText, geminiFetchJsonWithMetadata, type FetchOptions, type ProviderName } from "./geminiFetch";

export type ToolDeclaration = { name: string; description: string; parameters: Record<string, unknown> };
export type ToolCall = { name: string; args: Record<string, unknown> };
export type ToolRunner = (call: ToolCall) => Promise<unknown>;
export type TranscriptEntry = { step: number; call: ToolCall; result: unknown };

export type ToolLoopStop = "answered" | "max_rounds" | "tool_limit" | "deadline";

export type ToolLoopInput = {
  system: string;
  question: string;
  tools: ToolDeclaration[];
  runTool: ToolRunner;
  /** Most model calls allowed. The last one is sent with tools switched off so it has to answer. */
  maxRounds: number;
  /** Most tool executions in the whole loop. */
  maxToolCalls: number;
  /** Most tool executions requested in a single step; extras are refused, not run. */
  maxCallsPerStep: number;
  deadlineAt: number;
  provider?: ProviderName;
  maxOutputTokens?: number;
  fetchOptions?: Omit<FetchOptions, "deadlineAt">;
  /** Test seam; defaults to the real transport. */
  fetchJson?: typeof geminiFetchJsonWithMetadata;
};

export type ToolLoopResult = {
  text: string;
  transcript: TranscriptEntry[];
  modelCalls: number;
  stopped: ToolLoopStop;
  inputTokens: number;
  outputTokens: number;
};

type Part = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Gemini wants functionResponse.response to be an object.
function asResponseObject(result: unknown): Record<string, unknown> {
  return isRecord(result) ? result : { result };
}

function modelParts(data: unknown): Part[] {
  if (!isRecord(data) || !Array.isArray(data.candidates) || !isRecord(data.candidates[0])) return [];
  const content = data.candidates[0].content;
  return isRecord(content) && Array.isArray(content.parts) ? (content.parts.filter(isRecord) as Part[]) : [];
}

const MIN_ROUND_MS = 3_000;

export async function runToolLoop(input: ToolLoopInput): Promise<ToolLoopResult> {
  const fetchJson = input.fetchJson ?? geminiFetchJsonWithMetadata;
  const contents: Array<{ role: "user" | "model"; parts: Part[] }> = [{ role: "user", parts: [{ text: input.question }] }];
  const transcript: TranscriptEntry[] = [];
  let toolCallsUsed = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let modelCalls = 0;
  const declarations = input.tools.map((tool) => ({ name: tool.name, description: tool.description, parameters: tool.parameters }));

  for (let round = 1; round <= input.maxRounds; round += 1) {
    if (input.deadlineAt - Date.now() < MIN_ROUND_MS) {
      return { text: "", transcript, modelCalls, stopped: "deadline", inputTokens, outputTokens };
    }

    // Tools stay declared on the last round (some providers reject tool turns in the history
    // without them) but are switched off, so the model has to answer with what it has.
    const final = round === input.maxRounds || toolCallsUsed >= input.maxToolCalls;
    const body = {
      system_instruction: { parts: [{ text: input.system }] },
      contents,
      generation_config: { max_output_tokens: input.maxOutputTokens ?? 1500 },
      tools: [{ function_declarations: declarations }],
      ...(final ? { tool_config: { function_calling_config: { mode: "NONE" } } } : {}),
    };

    const { data, metadata } = await fetchJson(process.env.LLM_API_KEY ?? "", body, input.provider, { ...input.fetchOptions, deadlineAt: input.deadlineAt });
    modelCalls += 1;
    inputTokens += metadata.inputTokens ?? 0;
    outputTokens += metadata.outputTokens ?? 0;

    const parts = modelParts(data);
    const calls = parts.flatMap((part) => (isRecord(part.functionCall) ? [part.functionCall] : []));

    if (calls.length === 0) {
      return { text: extractReplyText(parts), transcript, modelCalls, stopped: "answered", inputTokens, outputTokens };
    }
    if (final) {
      // It asked for a tool when told not to: no answer to give.
      return { text: "", transcript, modelCalls, stopped: toolCallsUsed >= input.maxToolCalls ? "tool_limit" : "max_rounds", inputTokens, outputTokens };
    }

    // The model's own turn goes back into the history exactly as it came (parts can carry provider-specific fields).
    contents.push({ role: "model", parts });

    const responses = await Promise.all(
      calls.map(async (call, index) => {
        const name = typeof call.name === "string" ? call.name : "";
        const args = isRecord(call.args) ? call.args : {};
        let result: unknown;
        if (index >= input.maxCallsPerStep || toolCallsUsed + index >= input.maxToolCalls) {
          result = { error: "Too many tool calls at once; this one was not run. Ask for fewer things, or answer with what you have." };
        } else {
          try {
            result = await input.runTool({ name, args });
          } catch (error) {
            result = { error: error instanceof Error ? error.message.slice(0, 200) : "The tool failed." };
          }
          transcript.push({ step: round, call: { name, args }, result });
        }
        return { functionResponse: { name, response: asResponseObject(result) } };
      }),
    );
    toolCallsUsed += Math.min(calls.length, input.maxCallsPerStep, Math.max(0, input.maxToolCalls - toolCallsUsed));
    contents.push({ role: "user", parts: responses });
  }

  return { text: "", transcript, modelCalls, stopped: "max_rounds", inputTokens, outputTokens };
}
