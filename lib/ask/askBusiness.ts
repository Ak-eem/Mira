// Runs one owner question end to end: build the business's context, let the model use the fixed tools in a
// bounded loop, then decide what the owner actually sees. The model's prose is only shown if it passes the
// checks below; otherwise the owner gets an honest "can't tell" or the raw numbers.
import type { SupabaseClient } from "@supabase/supabase-js";
import { runToolLoop, type ToolLoopInput, type ToolLoopStop } from "@/lib/ai/toolLoop";
import { findUnsupportedNumbers } from "./answerCheck";
import { buildAskSystemPrompt, CANNOT_TELL } from "./prompt";
import { ASK_TOOL_DECLARATIONS, loadAskContext, runAskTool, type AskContext, type Figure, type ToolResult } from "./tools";

// Every limit here is a cost or time cap.
export const ASK_LIMITS = {
  questionMaxChars: 500,
  maxRounds: 4, // model calls per question (the last one has tools switched off)
  maxToolCalls: 6,
  maxCallsPerStep: 4,
  deadlineMs: 28_000,
  questionsPerBusinessPerHour: 30,
} as const;

export type SourceCard = {
  tool: string;
  what: string;
  method: string;
  period: string | null;
  timeZone: string | null;
  status: ToolResult["status"];
  notes: string[];
  figures: Figure[];
};

export type AskOutcome = {
  kind: "answer" | "cannot_tell" | "numbers_only" | "incomplete";
  text: string;
  sources: SourceCard[];
  stats: { modelCalls: number; toolCalls: number; ms: number; stopped: ToolLoopStop };
};

const CANNOT_TELL_RE = /^\s*i can['’]t tell from your data/i;

export function sourceCards(transcript: Array<{ result: unknown }>): SourceCard[] {
  const cards: SourceCard[] = [];
  for (const entry of transcript) {
    const result = entry.result as ToolResult;
    if (!result || typeof result !== "object" || !result.source) continue;
    cards.push({
      tool: result.source.tool,
      what: result.source.what,
      method: result.source.method,
      period: result.source.range?.label ?? null,
      timeZone: result.source.range?.timeZone ?? null,
      status: result.status,
      notes: result.message ? [result.message] : [],
      figures: result.figures ?? [],
    });
  }
  return cards;
}

function modelOptions(): Pick<ToolLoopInput, "provider" | "fetchOptions"> {
  const provider = process.env.ASK_AI_PROVIDER;
  return {
    provider: provider === "groq" || provider === "gemini" ? provider : undefined,
    // Point this feature at stronger models without touching code.
    fetchOptions: {
      groqModel: process.env.ASK_GROQ_MODEL || undefined,
      geminiModel: process.env.ASK_GEMINI_MODEL || undefined,
      timeoutMs: 20_000,
    },
  };
}

export type AskDeps = {
  loadContext: (supabase: SupabaseClient, businessId: string, now: Date) => Promise<AskContext | null>;
  runLoop: typeof runToolLoop;
  now: () => Date;
};

const liveDeps: AskDeps = { loadContext: loadAskContext, runLoop: runToolLoop, now: () => new Date() };

/** Returns null when the signed-in user has no access to this business. */
export async function askBusinessData(
  supabase: SupabaseClient,
  businessId: string,
  question: string,
  deps: AskDeps = liveDeps,
): Promise<AskOutcome | null> {
  const started = Date.now();
  const ctx = await deps.loadContext(supabase, businessId, deps.now());
  if (!ctx) return null;

  const loop = await deps.runLoop({
    system: buildAskSystemPrompt(ctx),
    question,
    tools: ASK_TOOL_DECLARATIONS,
    runTool: (call) => runAskTool(ctx, call),
    maxRounds: ASK_LIMITS.maxRounds,
    maxToolCalls: ASK_LIMITS.maxToolCalls,
    maxCallsPerStep: ASK_LIMITS.maxCallsPerStep,
    deadlineAt: started + ASK_LIMITS.deadlineMs,
    ...modelOptions(),
  });

  const sources = sourceCards(loop.transcript);
  const stats = { modelCalls: loop.modelCalls, toolCalls: loop.transcript.length, ms: Date.now() - started, stopped: loop.stopped };
  const results = loop.transcript.map((entry) => entry.result as ToolResult);
  const usable = results.some((result) => result.status !== "error");
  const text = loop.text.trim();

  if (loop.stopped !== "answered" || text === "") {
    return { kind: "incomplete", text: "I couldn't finish working that out in time. Try asking about one thing and a shorter period, for example: \"How many messages did customers send last week?\"", sources, stats };
  }

  // No usable lookup behind it means nothing to base an answer on, whatever the model wrote.
  if (!usable) {
    const explanation = CANNOT_TELL_RE.test(text) ? text : `${CANNOT_TELL}. None of the lookups I have could answer that.`;
    return { kind: "cannot_tell", text: explanation, sources, stats };
  }

  const unsupported = findUnsupportedNumbers(text, results, question);
  if (unsupported.length > 0) {
    if (CANNOT_TELL_RE.test(text)) return { kind: "cannot_tell", text: `${CANNOT_TELL}.`, sources, stats };
    return {
      kind: "numbers_only",
      text: "I found the figures below but couldn't put them into a summary I can fully stand behind, so here are the numbers themselves.",
      sources,
      stats,
    };
  }

  return { kind: CANNOT_TELL_RE.test(text) ? "cannot_tell" : "answer", text, sources, stats };
}
