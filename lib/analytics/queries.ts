import { createClient } from "@/lib/supabase/server";
import { unstable_cache } from "next/cache";

export type AnalyticsRange = "today" | "7d" | "30d" | "month";

export type AnalyticsPoint = { label: string; value: number; secondary?: number };

type ConversationRow = { id: string; started_at: string; needs_human: boolean; status: string };
type RatingRow = { customer_rating: number | null };

export type CountInsight = { label: string; count: number };
export type UnansweredInsight = { total: number; top: CountInsight[] };
export type RateInsight = { resolved: number; total: number; percentage: number };

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
  recentUnansweredQuestions: Array<{ question: string; askedAt: string }>;
  popularQuestions: CountInsight[] | null;
  topProducts: CountInsight[] | null;
  unansweredQuestions: UnansweredInsight | null;
  resolutionRate: RateInsight | null;
  reopenRate: RateInsight | null;
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
  if (businessId === null) {
    const getCachedSnapshot = unstable_cache(
      () => getAnalyticsSnapshotWithClient(supabase, null, range),
      ["analytics-snapshot-global", range],
      { revalidate: 60 },
    );
    return getCachedSnapshot();
  }
  return getAnalyticsSnapshotWithClient(supabase, businessId, range);
}

async function getAnalyticsSnapshotWithClient(
  supabase: Awaited<ReturnType<typeof createClient>>,
  businessId: string | null,
  requestedRange?: string,
): Promise<{ data: AnalyticsSnapshot | null; error: Error | null }> {
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
  let businessInsights: [CountInsight[], CountInsight[], UnansweredInsight, RateInsight, RateInsight] | null = null;
  if (businessId) {
    try {
      businessInsights = await Promise.all([
        getPopularQuestions(businessId, range),
        getTopProducts(businessId, range),
        getUnansweredQuestions(businessId, range),
        getResolutionRate(businessId, range),
        getReopenRate(businessId, range),
      ]);
    } catch (error) {
      return { data: null, error: error instanceof Error ? error : new Error("Business insights were unavailable.") };
    }
  }
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
      recentUnansweredQuestions: ((unansweredQuestionsResult.data ?? []) as { question: string; asked_at: string }[]).map((row) => ({
        question: row.question,
        askedAt: row.asked_at,
      })),
      popularQuestions: businessInsights?.[0] ?? null,
      topProducts: businessInsights?.[1] ?? null,
      unansweredQuestions: businessInsights?.[2] ?? null,
      resolutionRate: businessInsights?.[3] ?? null,
      reopenRate: businessInsights?.[4] ?? null,
    },
    error: null,
  };
}

function normalizeQuestion(value: string): string {
  return value.trim().replace(/\s+/g, " ").replace(/[.!?]+$/g, "").toLowerCase();
}

function topCounts(counts: Map<string, number>): CountInsight[] {
  return Array.from(counts, ([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
    .slice(0, 10);
}

async function getBusinessRange(businessId: string, requestedRange?: string) {
  const range = safeRange(requestedRange);
  const { from, to } = getRange(range);
  return { fromIso: from.toISOString(), toIso: to.toISOString() };
}

export async function getPopularQuestions(businessId: string, requestedRange?: string): Promise<CountInsight[]> {
  const supabase = await createClient();
  const { fromIso, toIso } = await getBusinessRange(businessId, requestedRange);
  const { data, error } = await supabase
    .from("messages")
    .select("content")
    .eq("business_id", businessId)
    .eq("role", "customer")
    .gte("created_at", fromIso)
    .lte("created_at", toIso);
  if (error) throw error;
  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const question = normalizeQuestion(row.content);
    if (question) counts.set(question, (counts.get(question) ?? 0) + 1);
  }
  return topCounts(counts);
}

export async function getTopProducts(businessId: string, requestedRange?: string): Promise<CountInsight[]> {
  const supabase = await createClient();
  const { fromIso, toIso } = await getBusinessRange(businessId, requestedRange);
  const [{ data: products, error: productsError }, { data: interests, error: interestsError }, { data: messages, error: messagesError }] = await Promise.all([
    supabase.from("products").select("id, name").eq("business_id", businessId),
    supabase.from("product_interest").select("product_id").eq("business_id", businessId).gte("created_at", fromIso).lte("created_at", toIso),
    supabase.from("messages").select("content").eq("business_id", businessId).eq("role", "customer").gte("created_at", fromIso).lte("created_at", toIso),
  ]);
  if (productsError || interestsError || messagesError) throw productsError ?? interestsError ?? messagesError;

  const countByProductId = new Map<string, number>();
  for (const interest of interests ?? []) countByProductId.set(interest.product_id, (countByProductId.get(interest.product_id) ?? 0) + 1);
  for (const product of products ?? []) {
    const name = product.name.trim().toLowerCase();
    if (!name) continue;
    const mentions = (messages ?? []).filter((message) => message.content.toLowerCase().includes(name)).length;
    if (mentions) countByProductId.set(product.id, (countByProductId.get(product.id) ?? 0) + mentions);
  }
  const productCounts: Array<[string, number]> = (products ?? [])
    .map((product): [string, number] => [product.name, countByProductId.get(product.id) ?? 0])
    .filter(([, count]) => count > 0);
  return topCounts(new Map(productCounts));
}

export async function getUnansweredQuestions(businessId: string, requestedRange?: string): Promise<UnansweredInsight> {
  const supabase = await createClient();
  const { fromIso, toIso } = await getBusinessRange(businessId, requestedRange);
  const { data: business, error: businessError } = await supabase.from("businesses").select("name").eq("id", businessId).single();
  if (businessError) throw businessError;
  const { data: messages, error } = await supabase
    .from("messages")
    .select("conversation_id, role, content, created_at")
    .eq("business_id", businessId)
    .gte("created_at", fromIso)
    .lte("created_at", toIso)
    .order("created_at", { ascending: true });
  if (error) throw error;

  const byConversation = new Map<string, { role: string; content: string }[]>();
  for (const message of messages ?? []) {
    const list = byConversation.get(message.conversation_id) ?? [];
    list.push(message);
    byConversation.set(message.conversation_id, list);
  }
  const counts = new Map<string, number>();
  let total = 0;
  for (const conversationMessages of byConversation.values()) {
    for (let index = 0; index < conversationMessages.length; index += 1) {
      const message = conversationMessages[index];
      if (message.role !== "assistant" || !/i don't have that information|recommend contacting them directly/i.test(message.content)) continue;
      const question = [...conversationMessages.slice(0, index)].reverse().find((candidate) => candidate.role === "customer");
      if (!question) continue;
      const normalized = normalizeQuestion(question.content);
      if (normalized) {
        total += 1;
        counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
      }
    }
  }
  return { total, top: topCounts(counts) };
}

export async function getResolutionRate(businessId: string, requestedRange?: string): Promise<RateInsight> {
  const supabase = await createClient();
  const { fromIso, toIso } = await getBusinessRange(businessId, requestedRange);
  const [{ count: total, error: totalError }, { count: resolved, error: resolvedError }] = await Promise.all([
    supabase.from("conversations").select("id", { count: "exact", head: true }).eq("business_id", businessId).gte("started_at", fromIso).lte("started_at", toIso),
    supabase.from("conversations").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("status", "closed").gte("started_at", fromIso).lte("started_at", toIso),
  ]);
  if (totalError || resolvedError) throw totalError ?? resolvedError;
  const totalCount = total ?? 0;
  const resolvedCount = resolved ?? 0;
  return { resolved: resolvedCount, total: totalCount, percentage: totalCount ? Math.round((resolvedCount / totalCount) * 100) : 0 };
}

export async function getReopenRate(businessId: string, requestedRange?: string): Promise<RateInsight> {
  const supabase = await createClient();
  const { fromIso, toIso } = await getBusinessRange(businessId, requestedRange);
  const { data, error } = await supabase
    .from("conversations")
    .select("id, session_token, started_at, status")
    .eq("business_id", businessId)
    .lte("started_at", toIso)
    .order("started_at", { ascending: true });
  if (error) throw error;
  const inRange = (data ?? []).filter((conversation) => conversation.started_at >= fromIso);
  const sessions = new Set<string>();
  for (const conversation of data ?? []) {
    if (conversation.started_at < fromIso && conversation.status === "closed") sessions.add(conversation.session_token);
  }
  const reopened = inRange.filter((conversation) => {
    if (conversation.status === "closed") {
      sessions.add(conversation.session_token);
      return false;
    }
    return sessions.has(conversation.session_token);
  }).length;
  const total = inRange.length;
  return { resolved: reopened, total, percentage: total ? Math.round((reopened / total) * 100) : 0 };
}