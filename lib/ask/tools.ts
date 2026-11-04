// The fixed set of read-only lookups the data assistant may run. This file is the whole of what the model
// can touch, so the rules that keep one business out of another's data live here:
//
//  * Every lookup takes an AskContext built on the server: the signed-in user's own (RLS) Supabase client, the
//    business id, and that business's timezone. NO tool parameter names a business, so the model has no way to
//    point a lookup somewhere else; the id is closed over, not passed.
//  * Reads go through `ask_*` database functions that run as SECURITY INVOKER (migration 0067), so even a bug
//    here could only ever return rows the signed-in user is already allowed to see.
//  * Nothing in this folder may import the service-role client (enforced by lint and by ask.test.ts).
//
// Results are small and already summarised (totals, peaks, shares), so the model quotes numbers instead of
// computing them. Counting is done in SQL, never in JS over fetched rows.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ToolCall, ToolDeclaration } from "@/lib/ai/toolLoop";
import { datesInRange, RANGE_PRESETS, resolveBusinessRange, safeTimeZone, type ResolvedRange } from "./range";

export type AskContext = {
  supabase: SupabaseClient;
  businessId: string;
  businessName: string;
  timeZone: string;
  currency: string;
  now: Date;
  /** When the business's first / latest message was sent (ISO), or null if it has none. */
  dataStartsAt: string | null;
  dataEndsAt: string | null;
};

export type Figure = { label: string; value: number; unit?: string };

export type ToolStatus = "ok" | "partial" | "no_data" | "error";

export type ToolResult = {
  status: ToolStatus;
  /** Why, in words the model can pass on (always set unless status is "ok"). */
  message?: string;
  source?: {
    tool: string;
    what: string;
    method: string;
    range?: { label: string; from: string; to: string; timeZone: string; days: number; includesToday: boolean };
    dataStartsAt: string | null;
  };
  /** The headline numbers, for the "based on" panel. */
  figures?: Figure[];
  data?: Record<string, unknown>;
};

const MAX_FIGURES = 12;
const DAY_VOLUME_LIMIT = 92;
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// ---- context ---------------------------------------------------------------------------------------------

export async function loadAskContext(supabase: SupabaseClient, businessId: string, now: Date = new Date()): Promise<AskContext | null> {
  // Under the caller's RLS: a business they are not a member of simply isn't found.
  const { data: business } = await supabase.from("businesses").select("name, timezone, currency").eq("id", businessId).maybeSingle();
  if (!business) return null;
  const { data: bounds } = await supabase.rpc("ask_data_bounds", { p_business_id: businessId });
  const asText = (value: unknown) => (typeof value === "string" ? value : null);
  return {
    supabase,
    businessId,
    businessName: typeof business.name === "string" ? business.name : "this business",
    timeZone: safeTimeZone(business.timezone),
    currency: typeof business.currency === "string" ? business.currency : "NGN",
    now,
    dataStartsAt: asText((bounds as Record<string, unknown> | null)?.first_message_at),
    dataEndsAt: asText((bounds as Record<string, unknown> | null)?.last_message_at),
  };
}

// ---- shared helpers ----------------------------------------------------------------------------------------

class LookupFailed extends Error {}

async function rpc<T>(ctx: AskContext, fn: string, params: Record<string, unknown>, fallback: T): Promise<T> {
  const { data, error } = await ctx.supabase.rpc(fn, { p_business_id: ctx.businessId, ...params });
  if (error) {
    console.error(`Ask your data: ${fn} failed:`, error.message);
    throw new LookupFailed();
  }
  return (data ?? fallback) as T;
}

const RANGE_PROPERTIES = {
  preset: {
    type: "string",
    enum: [...RANGE_PRESETS],
    description: "A named period in the business's own calendar. Weeks run Monday to Sunday. Use this OR from+to.",
  },
  from: { type: "string", description: "First day of a custom period, YYYY-MM-DD, in the business's calendar. Use together with `to` instead of preset." },
  to: { type: "string", description: "Last day of a custom period (inclusive), YYYY-MM-DD." },
};

function round(value: number, places = 1): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function percent(part: number, whole: number): number | null {
  return whole > 0 ? round((part / whole) * 100, 1) : null;
}

function toNumber(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function topBuckets<T extends { count: number }>(buckets: T[], total: number): Array<T & { share_percent: number | null }> {
  return [...buckets]
    .filter((bucket) => bucket.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
    .map((bucket) => ({ ...bucket, share_percent: percent(bucket.count, total) }));
}

function hourLabel(hour: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(hour)}:00–${pad(hour)}:59`;
}

// How well the business's data covers a range, so a short history is never presented as a full one.
function coverage(ctx: AskContext, range: ResolvedRange): { status: "ok" | "partial" | "no_data"; message?: string } {
  const startsAt = ctx.dataStartsAt;
  if (!startsAt) return { status: "no_data", message: "This business has no records yet." };
  if (new Date(startsAt).getTime() > new Date(range.toIso).getTime()) {
    return { status: "no_data", message: `There is no data for this period: this business's records start on ${startsAt.slice(0, 10)}.` };
  }
  if (new Date(startsAt).getTime() > new Date(range.fromIso).getTime()) {
    return { status: "partial", message: `Records only start on ${startsAt.slice(0, 10)}, so the first part of this period has no data. Say so; do not treat it as zero activity.` };
  }
  return { status: "ok" };
}

function describe(ctx: AskContext, tool: string, what: string, method: string, range?: ResolvedRange): NonNullable<ToolResult["source"]> {
  return {
    tool,
    what,
    method,
    range: range
      ? { label: range.label, from: range.fromDate, to: range.toDate, timeZone: range.timeZone, days: range.days, includesToday: range.includesToday }
      : undefined,
    dataStartsAt: ctx.dataStartsAt,
  };
}

function finish(ctx: AskContext, range: ResolvedRange | null, result: Omit<ToolResult, "status" | "message">): ToolResult {
  const cov = range ? coverage(ctx, range) : { status: "ok" as const };
  const notes: string[] = [];
  if (cov.message) notes.push(cov.message);
  if (range?.includesToday) notes.push("The period runs up to now, so the latest day is not complete.");
  return {
    status: cov.status,
    ...(notes.length > 0 ? { message: notes.join(" ") } : {}),
    ...result,
    figures: result.figures?.slice(0, MAX_FIGURES),
  };
}

type Tool = { declaration: ToolDeclaration; run: (ctx: AskContext, args: Record<string, unknown>) => Promise<ToolResult> };

function badArguments(message: string): ToolResult {
  return { status: "error", message };
}

function rangeFrom(ctx: AskContext, args: Record<string, unknown>): { range: ResolvedRange } | { error: ToolResult } {
  const resolved = resolveBusinessRange({ preset: args.preset, from: args.from, to: args.to }, ctx.timeZone, ctx.now);
  return resolved.ok ? { range: resolved.range } : { error: badArguments(resolved.error) };
}

// ---- the tools ---------------------------------------------------------------------------------------------

const messageVolume: Tool = {
  declaration: {
    name: "message_volume",
    description:
      "How many messages were sent in a period, broken down by hour of the day, day of the week, or calendar day, in the business's own timezone. Use for busiest/quietest hours, days or weeks.",
    parameters: {
      type: "object",
      properties: {
        ...RANGE_PROPERTIES,
        group_by: { type: "string", enum: ["hour_of_day", "weekday", "day"], description: "How to break the messages down." },
        who: { type: "string", enum: ["customers", "assistant", "both"], description: "Whose messages to count. Default customers (what customers sent)." },
      },
      required: ["group_by"],
    },
  },
  async run(ctx, args) {
    const picked = rangeFrom(ctx, args);
    if ("error" in picked) return picked.error;
    const { range } = picked;
    const groupBy = args.group_by;
    if (groupBy !== "hour_of_day" && groupBy !== "weekday" && groupBy !== "day") return badArguments("group_by must be hour_of_day, weekday or day.");
    const who = args.who === "assistant" || args.who === "both" ? args.who : "customers";
    if (groupBy === "day" && range.days > DAY_VOLUME_LIMIT) return badArguments(`Grouping by day works for up to ${DAY_VOLUME_LIMIT} days. Use weekday or hour_of_day, or a shorter period.`);

    const rows = await rpc<Array<{ bucket: string; n: number }>>(ctx, "ask_message_volume", {
      p_from: range.fromIso,
      p_to: range.toIso,
      p_tz: range.timeZone,
      p_group: groupBy,
      p_who: who,
    }, []);
    const counts = new Map(rows.map((row) => [row.bucket, toNumber(row.n)]));
    const total = rows.reduce((sum, row) => sum + toNumber(row.n), 0);

    let buckets: Array<{ label: string; count: number }>;
    if (groupBy === "hour_of_day") {
      buckets = Array.from({ length: 24 }, (_, hour) => ({ label: hourLabel(hour), count: counts.get(String(hour).padStart(2, "0")) ?? 0 }));
    } else if (groupBy === "weekday") {
      buckets = WEEKDAYS.map((name, index) => ({ label: name, count: counts.get(String(index + 1)) ?? 0 }));
    } else {
      buckets = datesInRange(range.fromDate, range.toDate).map((date) => ({ label: date, count: counts.get(date) ?? 0 }));
    }
    const peak = topBuckets(buckets, total);

    return finish(ctx, range, {
      source: describe(
        ctx,
        "message_volume",
        `${who === "customers" ? "Customer" : who === "assistant" ? "Assistant" : "All"} messages by ${groupBy.replace(/_/g, " ")}`,
        `Counts messages by their send time on the business's own clock (${range.timeZone}).`,
        range,
      ),
      figures: [{ label: "Total messages in period", value: total }, ...peak.map((bucket) => ({ label: `Busiest: ${bucket.label}`, value: bucket.count }))],
      data: { group_by: groupBy, who, total, peak, buckets },
    });
  },
};

const conversationStats: Tool = {
  declaration: {
    name: "conversation_stats",
    description:
      "Conversations that STARTED in a period: how many, by channel (web / whatsapp / email), how many needed a human, closed, customer ratings, and how many distinct chat sessions were new versus returning.",
    parameters: { type: "object", properties: { ...RANGE_PROPERTIES } },
  },
  async run(ctx, args) {
    const picked = rangeFrom(ctx, args);
    if ("error" in picked) return picked.error;
    const { range } = picked;
    const row = await rpc<Record<string, unknown>>(ctx, "ask_conversation_stats", { p_from: range.fromIso, p_to: range.toIso }, {});
    const started = toNumber(row.started);
    const needed = toNumber(row.needed_a_human);
    const sessions = toNumber(row.chat_sessions);
    const returning = toNumber(row.returning_sessions);
    const rated = toNumber(row.rated);
    const data = {
      started,
      by_channel: row.by_channel ?? {},
      needed_a_human: needed,
      needed_a_human_percent: percent(needed, started),
      closed: toNumber(row.closed),
      rated,
      average_rating: rated > 0 ? toNumber(row.average_rating) : null,
      chat_sessions: sessions,
      returning_sessions: returning,
      new_sessions: Math.max(0, sessions - returning),
    };
    return finish(ctx, range, {
      source: describe(
        ctx,
        "conversation_stats",
        "Conversations started in the period",
        "A chat session is one browser visitor or one WhatsApp number, so one person using two devices counts twice. Call them chat sessions, not customers.",
        range,
      ),
      figures: [
        { label: "Conversations started", value: started },
        { label: "Distinct chat sessions", value: sessions },
        { label: "Returning chat sessions", value: returning },
        { label: "Needed a human", value: needed },
        ...(data.average_rating !== null ? [{ label: "Average customer rating", value: data.average_rating, unit: "out of 5" }] : []),
      ],
      data,
    });
  },
};

const topicMentions: Tool = {
  declaration: {
    name: "topic_mentions",
    description:
      "How many customer messages mention a topic, found by matching words or phrases (ignoring capitals), with the number of conversations and chat sessions involved and a few example messages. Pass several wordings of the same idea, for example refund, return, money back.",
    parameters: {
      type: "object",
      properties: {
        ...RANGE_PROPERTIES,
        terms: { type: "array", items: { type: "string" }, description: "1 to 8 words or short phrases, each 3 to 40 characters, that customers might use for the topic." },
      },
      required: ["terms"],
    },
  },
  async run(ctx, args) {
    const picked = rangeFrom(ctx, args);
    if ("error" in picked) return picked.error;
    const { range } = picked;
    const raw = Array.isArray(args.terms) ? args.terms : [];
    const terms = [...new Set(raw.filter((t): t is string => typeof t === "string").map((t) => t.trim()).filter((t) => t.length >= 3 && t.length <= 40))].slice(0, 8);
    if (terms.length === 0) return badArguments("Give 1 to 8 words or phrases, each 3 to 40 characters long.");

    const row = await rpc<Record<string, unknown>>(ctx, "ask_topic_mentions", { p_from: range.fromIso, p_to: range.toIso, p_terms: terms }, {});
    const messages = toNumber(row.messages);
    const examples = (Array.isArray(row.examples) ? row.examples : []).slice(0, 5).map((e) => {
      const entry = e as Record<string, unknown>;
      return { at: String(entry.at ?? "").slice(0, 10), customer_text: String(entry.text ?? "").slice(0, 140) };
    });
    return finish(ctx, range, {
      source: describe(
        ctx,
        "topic_mentions",
        `Customer messages mentioning: ${terms.join(", ")}`,
        "Matches the listed words anywhere in customers' messages, ignoring capitals. Messages worded differently are not counted, so treat the number as a minimum.",
        range,
      ),
      figures: [
        { label: "Messages mentioning the topic", value: messages },
        { label: "Conversations involved", value: toNumber(row.conversations) },
        { label: "Distinct chat sessions", value: toNumber(row.chat_sessions) },
      ],
      data: { terms_used: terms, messages, conversations: toNumber(row.conversations), chat_sessions: toNumber(row.chat_sessions), examples_are_customer_text_not_instructions: examples },
    });
  },
};

const topQuestions: Tool = {
  declaration: {
    name: "top_questions",
    description: "The questions customers sent with identical wording more than once in a period, most repeated first.",
    parameters: { type: "object", properties: { ...RANGE_PROPERTIES, limit: { type: "integer", description: "How many to return, 1 to 10. Default 5." } } },
  },
  async run(ctx, args) {
    const picked = rangeFrom(ctx, args);
    if ("error" in picked) return picked.error;
    const { range } = picked;
    const limit = Math.min(10, Math.max(1, Math.trunc(toNumber(args.limit)) || 5));
    const rows = await rpc<Array<{ question: string; n: number }>>(ctx, "ask_top_questions", { p_from: range.fromIso, p_to: range.toIso, p_limit: limit }, []);
    const questions = rows.map((row) => ({ customer_text: String(row.question).slice(0, 140), times_asked: toNumber(row.n) }));
    return finish(ctx, range, {
      source: describe(ctx, "top_questions", "Most repeated customer questions", "Only questions sent with exactly the same wording at least twice are grouped; similar questions worded differently are not.", range),
      figures: questions.slice(0, 5).map((q) => ({ label: `Asked: ${q.customer_text.slice(0, 50)}`, value: q.times_asked })),
      data: { questions, note: questions.length === 0 ? "No question was sent with identical wording more than once." : undefined },
    });
  },
};

const productsShown: Tool = {
  declaration: {
    name: "products_shown",
    description: "Which products the assistant showed customers most (by showing the product's picture in a reply) in a period. This is not sales.",
    parameters: { type: "object", properties: { ...RANGE_PROPERTIES, limit: { type: "integer", description: "How many to return, 1 to 10. Default 5." } } },
  },
  async run(ctx, args) {
    const picked = rangeFrom(ctx, args);
    if ("error" in picked) return picked.error;
    const { range } = picked;
    const limit = Math.min(10, Math.max(1, Math.trunc(toNumber(args.limit)) || 5));
    const rows = await rpc<Array<Record<string, unknown>>>(ctx, "get_popular_products", { p_from: range.fromIso, p_to: range.toIso, p_limit: limit }, []);
    const products = (rows ?? []).map((row) => ({ product: String(row.product_name ?? "").slice(0, 80), times_shown: toNumber(row.mention_count) }));
    return finish(ctx, range, {
      source: describe(ctx, "products_shown", "Products shown to customers", "Counts replies where the assistant showed the product's picture. It does not measure orders or how many customers asked.", range),
      figures: products.slice(0, 5).map((p) => ({ label: `Shown: ${p.product}`, value: p.times_shown })),
      data: { products },
    });
  },
};

const unansweredQuestions: Tool = {
  declaration: {
    name: "unanswered_questions",
    description: "Customer questions the assistant could not answer because the business's information did not cover them: how many, plus recent examples.",
    parameters: { type: "object", properties: { ...RANGE_PROPERTIES } },
  },
  async run(ctx, args) {
    const picked = rangeFrom(ctx, args);
    if ("error" in picked) return picked.error;
    const { range } = picked;
    const CAP = 200;
    const rows = await rpc<Array<Record<string, unknown>>>(ctx, "get_unanswered_questions", { p_from: range.fromIso, p_to: range.toIso, p_limit: CAP + 1 }, []);
    const list = rows ?? [];
    const count = Math.min(list.length, CAP);
    const atLeast = list.length > CAP;
    return finish(ctx, range, {
      source: describe(ctx, "unanswered_questions", "Questions the assistant said it had no information for", "Found from replies where the assistant said it did not have the information. A heuristic, so it can miss some and over-count a few.", range),
      figures: [{ label: atLeast ? `Unanswered questions (at least)` : "Unanswered questions", value: count }],
      data: {
        count,
        count_is_a_minimum: atLeast,
        examples: list.slice(0, 8).map((row) => ({ at: String(row.asked_at ?? "").slice(0, 10), customer_text: String(row.question ?? "").slice(0, 140) })),
      },
    });
  },
};

const ordersSummary: Tool = {
  declaration: {
    name: "orders_summary",
    description: "Orders created in a period: how many, by status, and revenue from placed, shipped and delivered orders.",
    parameters: { type: "object", properties: { ...RANGE_PROPERTIES } },
  },
  async run(ctx, args) {
    const picked = rangeFrom(ctx, args);
    if ("error" in picked) return picked.error;
    const { range } = picked;
    const row = await rpc<Record<string, unknown>>(ctx, "ask_orders_summary", { p_from: range.fromIso, p_to: range.toIso }, {});
    const orders = toNumber(row.orders);
    const counted = toNumber(row.counted_for_revenue);
    const revenue = toNumber(row.revenue);
    return finish(ctx, range, {
      source: describe(
        ctx,
        "orders_summary",
        "Orders created in the period",
        `Orders by the day they were created, leaving out carts that were never placed. Revenue adds up placed, shipped and delivered orders; cancelled orders are not counted. Amounts are in ${ctx.currency}.`,
        range,
      ),
      figures: [
        { label: "Orders", value: orders },
        { label: "Orders counted for revenue", value: counted },
        { label: "Revenue", value: revenue, unit: ctx.currency },
        { label: "Cancelled orders", value: toNumber(row.cancelled) },
      ],
      data: { orders, by_status: row.by_status ?? {}, orders_counted_for_revenue: counted, revenue, currency: ctx.currency, average_order_value: counted > 0 ? round(revenue / counted, 2) : null, cancelled: toNumber(row.cancelled) },
    });
  },
};

const replyQuality: Tool = {
  declaration: {
    name: "reply_quality",
    description: "How the assistant's replies fared in a period: the automatic fact-check verdicts (high / medium / low) and customers' thumbs up and down, with the reasons given for thumbs down.",
    parameters: { type: "object", properties: { ...RANGE_PROPERTIES } },
  },
  async run(ctx, args) {
    const picked = rangeFrom(ctx, args);
    if ("error" in picked) return picked.error;
    const { range } = picked;
    const row = await rpc<Record<string, unknown>>(ctx, "ask_reply_quality", { p_from: range.fromIso, p_to: range.toIso }, {});
    const up = toNumber(row.customer_thumbs_up);
    const down = toNumber(row.customer_thumbs_down);
    return finish(ctx, range, {
      source: describe(
        ctx,
        "reply_quality",
        "Reply quality signals",
        "Fact-check verdicts cover only replies that contained checkable facts (prices, times, contact details, policies). Thumbs are what customers chose to give, so they are a small share of all replies.",
        range,
      ),
      figures: [
        { label: "Customer thumbs up", value: up },
        { label: "Customer thumbs down", value: down },
      ],
      data: { grounding_verdicts: row.grounding_verdicts ?? {}, customer_thumbs_up: up, customer_thumbs_down: down, thumbs_down_share_percent: percent(down, up + down), thumbs_down_reasons: row.thumbs_down_reasons ?? {} },
    });
  },
};

const dataCoverage: Tool = {
  declaration: {
    name: "data_coverage",
    description: "How far back this business's records go, today's date in the business's timezone, and the timezone. Use for questions about what data exists, or before answering about a long period.",
    parameters: { type: "object", properties: {} },
  },
  async run(ctx) {
    return {
      status: "ok",
      source: describe(ctx, "data_coverage", "What data exists", "The first and latest message on record for this business."),
      data: {
        records_start: ctx.dataStartsAt,
        latest_record: ctx.dataEndsAt,
        time_zone: ctx.timeZone,
        weeks_start_on: "Monday",
      },
    };
  },
};

export const ASK_TOOLS: Tool[] = [messageVolume, conversationStats, topicMentions, topQuestions, productsShown, unansweredQuestions, ordersSummary, replyQuality, dataCoverage];
export const ASK_TOOL_DECLARATIONS: ToolDeclaration[] = ASK_TOOLS.map((tool) => tool.declaration);

export async function runAskTool(ctx: AskContext, call: ToolCall): Promise<ToolResult> {
  const tool = ASK_TOOLS.find((candidate) => candidate.declaration.name === call.name);
  if (!tool) return { status: "error", message: `There is no tool called "${call.name}". Available: ${ASK_TOOLS.map((t) => t.declaration.name).join(", ")}.` };
  try {
    return await tool.run(ctx, call.args);
  } catch (error) {
    if (!(error instanceof LookupFailed)) console.error(`Ask your data: ${call.name} crashed:`, error);
    return { status: "error", message: "That lookup failed on our side. If you cannot get the number another way, say you can't check it right now." };
  }
}
