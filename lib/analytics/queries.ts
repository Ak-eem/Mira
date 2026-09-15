import { createClient } from "@/lib/supabase/server";

export type AnalyticsRange = "today" | "7d" | "30d" | "month";

export type AnalyticsPoint = { label: string; value: number; secondary?: number };

type ConversationRow = { id: string; started_at: string; needs_human: boolean; status: string };
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
  closedConversations: number;
  activeBusinesses: number | null;
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
  // Business-scoped only -- empty for the platform-wide (businessId=null)
  // snapshot, since "popular products" and "unanswered questions" don't
  // mean anything aggregated across unrelated businesses' catalogs.
  popularProducts: Array<{ productName: string; mentionCount: number }>;
  unansweredQuestions: Array<{ question: string; askedAt: string }>;
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
  const scoped = (query: any) => businessId ? query.eq("business_id", businessId) : query;
  const conversationScope = (query: any) => {
    const result = query.gte("started_at", fromIso).lte("started_at", toIso);
    return businessId ? result.eq("business_id", businessId) : result;
  };
  const [conversationCount, messageCount, customerMessageCount, assistantMessageCount, humanHelpCount, unresolvedCount, closedCount, conversations, aggregateResult, recentErrors, ratings, activeBusinesses, popularProductsResult, unansweredQuestionsResult] = await Promise.all([
    conversationScope(supabase.from("conversations").select("id", { count: "exact", head: true })),
    scoped(supabase.from("messages").select("id", { count: "exact", head: true }).gte("created_at", fromIso).lte("created_at", toIso)),
    scoped(supabase.from("messages").select("id", { count: "exact", head: true }).eq("role", "customer").gte("created_at", fromIso).lte("created_at", toIso)),
    scoped(supabase.from("messages").select("id", { count: "exact", head: true }).eq("role", "assistant").gte("created_at", fromIso).lte("created_at", toIso)),
    conversationScope(supabase.from("conversations").select("id", { count: "exact", head: true }).eq("needs_human", true)),
    conversationScope(supabase.from("conversations").select("id", { count: "exact", head: true }).eq("status", "open")),
    conversationScope(supabase.from("conversations").select("id", { count: "exact", head: true }).eq("status", "closed")),
    conversationScope(supabase.from("conversations").select("id, started_at, needs_human")).order("started_at", { ascending: true }).order("id", { ascending: true }),
    supabase.rpc("get_ai_response_aggregate", { p_business_id: businessId, p_from: fromIso, p_to: toIso }),
    scoped(supabase.from("ai_response_telemetry").select("id, provider, error_code, created_at").eq("success", false).gte("created_at", fromIso).lte("created_at", toIso).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(8)),
    businessId
      ? supabase.from("conversations").select("customer_rating").eq("business_id", businessId).not("customer_rating", "is", null).gte("customer_rated_at", fromIso).lte("customer_rated_at", toIso)
      : supabase.from("conversations").select("customer_rating").not("customer_rating", "is", null).gte("customer_rated_at", fromIso).lte("customer_rated_at", toIso),
    businessId
      ? Promise.resolve({ count: null, error: null })
      : supabase.from("businesses").select("id", { count: "exact", head: true }).eq("is_active", true),
    // Business-scoped only -- see the AnalyticsSnapshot comment above.
    businessId
      ? supabase.rpc("get_popular_products", { p_business_id: businessId, p_from: fromIso, p_to: toIso, p_limit: 5 })
      : Promise.resolve({ data: [] as { product_name: string; mention_count: number }[], error: null }),
    businessId
      ? supabase.rpc("get_unanswered_questions", { p_business_id: businessId, p_from: fromIso, p_to: toIso, p_limit: 5 })
      : Promise.resolve({ data: [] as { question: string; asked_at: string }[], error: null }),
  ]);

  const firstError = conversationCount.error ?? messageCount.error ?? customerMessageCount.error ?? assistantMessageCount.error ?? humanHelpCount.error ?? unresolvedCount.error ?? closedCount.error ?? conversations.error ?? aggregateResult.error ?? recentErrors.error ?? ratings.error ?? activeBusinesses.error ?? popularProductsResult.error ?? unansweredQuestionsResult.error;
  if (firstError) return { data: null, error: firstError };

  const conversationRows = (conversations.data ?? []) as ConversationRow[];
  const aggregate = (Array.isArray(aggregateResult.data) ? aggregateResult.data[0] : aggregateResult.data) as {
    total_count: number;
    successful_count: number;
    failed_count: number;
    fallback_count: number;
    groq_count: number;
    gemini_count: number;
    latency_sum: number;
    latency_count: number;
    input_tokens_sum: number | null;
    output_tokens_sum: number | null;
    token_count: number;
  } | null;
  if (!aggregate) return { data: null, error: new Error("Analytics aggregate was unavailable.") };
  const dayMap = new Map<string, { value: number; secondary: number }>();
  for (const row of conversationRows) {
    const label = dayLabel(row.started_at);
    const current = dayMap.get(label) ?? { value: 0, secondary: 0 };
    current.value += 1;
    if (row.needs_human) current.secondary += 1;
    dayMap.set(label, current);
  }
  const providerBreakdown = [
    { label: "Groq", value: aggregate.groq_count },
    { label: "Gemini", value: aggregate.gemini_count },
  ];
  const ratingRows = (ratings.data ?? []) as RatingRow[];
  const ratedRows = ratingRows.filter((row): row is { customer_rating: number } => typeof row.customer_rating === "number");

  return {
    data: {
      range,
      from: fromIso,
      to: toIso,
      conversations: conversationCount.count ?? 0,
      messages: messageCount.count ?? 0,
      customerMessages: customerMessageCount.count ?? 0,
      assistantMessages: assistantMessageCount.count ?? 0,
      humanHelp: humanHelpCount.count ?? 0,
      unresolved: unresolvedCount.count ?? 0,
      closedConversations: closedCount.count ?? 0,
      activeBusinesses: activeBusinesses.count,
      successfulResponses: aggregate.successful_count,
      failedResponses: aggregate.failed_count,
      averageLatencyMs: aggregate.latency_count ? Math.round(aggregate.latency_sum / aggregate.latency_count) : null,
      fallbackResponses: aggregate.fallback_count,
      groqResponses: aggregate.groq_count,
      geminiResponses: aggregate.gemini_count,
      apiTokens: aggregate.token_count > 0 ? (aggregate.input_tokens_sum ?? 0) + (aggregate.output_tokens_sum ?? 0) : null,
      satisfaction: ratedRows.length ? Math.round((ratedRows.reduce((sum, row) => sum + row.customer_rating, 0) / ratedRows.length) * 10) / 10 : null,
      conversationsOverTime: Array.from(dayMap, ([label, point]) => ({ label, ...point })),
      providerBreakdown,
      recentErrors: recentErrors.data ?? [],
      popularProducts: ((popularProductsResult.data ?? []) as { product_name: string; mention_count: number }[]).map((row) => ({
        productName: row.product_name,
        mentionCount: row.mention_count,
      })),
      unansweredQuestions: ((unansweredQuestionsResult.data ?? []) as { question: string; asked_at: string }[]).map((row) => ({
        question: row.question,
        askedAt: row.asked_at,
      })),
    },
    error: null,
  };
}