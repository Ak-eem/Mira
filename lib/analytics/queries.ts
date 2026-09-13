import { createClient } from "@/lib/supabase/server";

export type AnalyticsRange = "today" | "7d" | "30d" | "month";

export type AnalyticsPoint = { label: string; value: number; secondary?: number };

type ConversationRow = { id: string; started_at: string; needs_human: boolean; status: string };
type MessageRow = { id: string; role: string; created_at: string };
type TelemetryRow = { id: string; provider: string; fallback_from: string | null; success: boolean; latency_ms: number; input_tokens: number | null; output_tokens: number | null; error_code: string | null; created_at: string };
type RatingRow = { customer_rating: number | null };

export type AnalyticsSnapshot = {
  range: AnalyticsRange;
  from: string;
  to: string;
  conversations: number;
  messages: number;
  customerMessages: number;
  assistantMessages: number;
  humanHelp: number;
  unresolved: number;
  successfulResponses: number;
  failedResponses: number;
  averageLatencyMs: number | null;
  fallbackResponses: number;
  groqResponses: number;
  geminiResponses: number;
  apiTokens: number | null;
  satisfaction: number | null;
  conversationsOverTime: AnalyticsPoint[];
  providerBreakdown: AnalyticsPoint[];
  recentErrors: Array<{ id: string; provider: string; error_code: string | null; created_at: string }>;
};

function getRange(range: AnalyticsRange): { from: Date; to: Date } {
  const to = new Date();
  const from = new Date(to);
  if (range === "today") from.setHours(0, 0, 0, 0);
  if (range === "7d") from.setDate(from.getDate() - 6);
  if (range === "30d") from.setDate(from.getDate() - 29);
  if (range === "month") {
    from.setDate(1);
    from.setHours(0, 0, 0, 0);
  }
  return { from, to };
}

function safeRange(value: string | undefined): AnalyticsRange {
  return value === "today" || value === "7d" || value === "30d" || value === "month" ? value : "7d";
}

export function parseAnalyticsRange(value: string | undefined): AnalyticsRange {
  return safeRange(value);
}

function dayLabel(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export async function getAnalyticsSnapshot(
  businessId: string | null,
  requestedRange?: string,
): Promise<{ data: AnalyticsSnapshot | null; error: Error | null }> {
  const supabase = await createClient();
  const range = safeRange(requestedRange);
  const { from, to } = getRange(range);
  const fromIso = from.toISOString();
  const toIso = to.toISOString();
  const scope = (query: any) => businessId ? query.eq("business_id", businessId) : query;

  const [conversations, messages, telemetry, ratings] = await Promise.all([
    scope(supabase.from("conversations").select("id, started_at, needs_human, status").gte("started_at", fromIso).lte("started_at", toIso)),
    scope(supabase.from("messages").select("id, role, created_at").gte("created_at", fromIso).lte("created_at", toIso).limit(10000)),
    scope(supabase.from("ai_response_telemetry").select("id, provider, fallback_from, success, latency_ms, input_tokens, output_tokens, error_code, created_at").gte("created_at", fromIso).lte("created_at", toIso).limit(10000)),
    businessId
      ? supabase.from("conversations").select("customer_rating").eq("business_id", businessId).not("customer_rating", "is", null).gte("customer_rated_at", fromIso).lte("customer_rated_at", toIso)
      : supabase.from("conversations").select("customer_rating").not("customer_rating", "is", null).gte("customer_rated_at", fromIso).lte("customer_rated_at", toIso),
  ]);

  const firstError = conversations.error ?? messages.error ?? telemetry.error ?? ratings.error;
  if (firstError) return { data: null, error: firstError };

  const conversationRows = (conversations.data ?? []) as ConversationRow[];
  const messageRows = (messages.data ?? []) as MessageRow[];
  const telemetryRows = (telemetry.data ?? []) as TelemetryRow[];
  const successfulResponses = telemetryRows.filter((row) => row.success).length;
  const failedResponses = telemetryRows.filter((row) => !row.success).length;
  const latencyRows = telemetryRows.filter((row) => row.success && typeof row.latency_ms === "number");
  const tokenRows = telemetryRows.filter((row) => typeof row.input_tokens === "number" || typeof row.output_tokens === "number");
  const dayMap = new Map<string, { value: number; secondary: number }>();
  for (const row of conversationRows) {
    const label = dayLabel(row.started_at);
    const current = dayMap.get(label) ?? { value: 0, secondary: 0 };
    current.value += 1;
    if (row.needs_human) current.secondary += 1;
    dayMap.set(label, current);
  }
  const providerBreakdown = ["groq", "gemini"].map((provider) => ({
    label: provider === "groq" ? "Groq" : "Gemini",
    value: telemetryRows.filter((row) => row.provider === provider && row.success).length,
  }));
  const ratingRows = (ratings.data ?? []) as RatingRow[];
  const ratedRows = ratingRows.filter((row): row is { customer_rating: number } => typeof row.customer_rating === "number");

  return {
    data: {
      range,
      from: fromIso,
      to: toIso,
      conversations: conversationRows.length,
      messages: messageRows.length,
      customerMessages: messageRows.filter((row) => row.role === "customer").length,
      assistantMessages: messageRows.filter((row) => row.role === "assistant").length,
      humanHelp: conversationRows.filter((row) => row.needs_human).length,
      unresolved: conversationRows.filter((row) => row.status === "open").length,
      successfulResponses,
      failedResponses,
      averageLatencyMs: latencyRows.length ? Math.round(latencyRows.reduce((sum, row) => sum + row.latency_ms, 0) / latencyRows.length) : null,
      fallbackResponses: telemetryRows.filter((row) => row.fallback_from !== null).length,
      groqResponses: providerBreakdown[0].value,
      geminiResponses: providerBreakdown[1].value,
      apiTokens: tokenRows.length ? tokenRows.reduce((sum, row) => sum + (row.input_tokens ?? 0) + (row.output_tokens ?? 0), 0) : null,
      satisfaction: ratedRows.length ? Math.round((ratedRows.reduce((sum, row) => sum + row.customer_rating, 0) / ratedRows.length) * 10) / 10 : null,
      conversationsOverTime: Array.from(dayMap, ([label, point]) => ({ label, ...point })),
      providerBreakdown,
      recentErrors: telemetryRows.filter((row) => !row.success).slice(-8).reverse(),
    },
    error: null,
  };
}