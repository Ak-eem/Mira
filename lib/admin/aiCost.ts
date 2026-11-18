// Turns recorded AI token counts into an estimated naira cost, so the admin dashboard
// can show which businesses are getting expensive relative to what they pay.
//
// This is an ESTIMATE shown to the platform admin only. It never limits, slows or
// blocks anything, and it is not shown on the client portal.

import { MONTHLY_PRICE_NGN } from "@/lib/subscription-tiers";

export type AiProvider = "groq" | "gemini";

export type ProviderRate = { inUsdPerMillion: number; outUsdPerMillion: number };

export type AiRates = {
  usdToNgn: number;
  groq: ProviderRate;
  gemini: ProviderRate;
};

// Groq gpt-oss-120b list price (Oct 2026): $0.15 in / $0.60 out per million tokens.
// Gemini is the backup provider and its price for the configured model was not verified,
// so it defaults to a deliberately high figure (an estimate that errs towards "costs more").
// Every number can be overridden in the environment when prices or the exchange rate move.
export const DEFAULT_RATES: AiRates = {
  usdToNgn: 1400,
  groq: { inUsdPerMillion: 0.15, outUsdPerMillion: 0.6 },
  gemini: { inUsdPerMillion: 0.75, outUsdPerMillion: 4.5 },
};

// The price a business pays per month. Same source as the landing page and checkout
// (PAYSTACK_BASE_AMOUNT_NGN), falling back to the list price if it is unset or invalid.
export function planPriceFromEnv(env: Record<string, string | undefined> = process.env): number {
  return positiveNumber(env.PAYSTACK_BASE_AMOUNT_NGN, MONTHLY_PRICE_NGN);
}

export const WATCH_RATIO = 0.5; // flag when AI cost is half the plan price
export const OVER_RATIO = 1; // and again when it reaches the whole plan price
export const MIN_DAYS_FOR_PROJECTION = 3;

function positiveNumber(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return value !== undefined && value.trim() !== "" && Number.isFinite(n) && n > 0 ? n : fallback;
}

export function ratesFromEnv(env: Record<string, string | undefined> = process.env): AiRates {
  return {
    usdToNgn: positiveNumber(env.AI_USD_TO_NGN, DEFAULT_RATES.usdToNgn),
    groq: {
      inUsdPerMillion: positiveNumber(env.AI_GROQ_USD_PER_M_IN, DEFAULT_RATES.groq.inUsdPerMillion),
      outUsdPerMillion: positiveNumber(env.AI_GROQ_USD_PER_M_OUT, DEFAULT_RATES.groq.outUsdPerMillion),
    },
    gemini: {
      inUsdPerMillion: positiveNumber(env.AI_GEMINI_USD_PER_M_IN, DEFAULT_RATES.gemini.inUsdPerMillion),
      outUsdPerMillion: positiveNumber(env.AI_GEMINI_USD_PER_M_OUT, DEFAULT_RATES.gemini.outUsdPerMillion),
    },
  };
}

export type UsageRow = {
  businessId: string;
  provider: AiProvider;
  calls: number;
  inputTokens: number;
  outputTokens: number;
};

export function rowCostNgn(row: UsageRow, rates: AiRates): number {
  const rate = rates[row.provider];
  const usd = (row.inputTokens * rate.inUsdPerMillion + row.outputTokens * rate.outUsdPerMillion) / 1_000_000;
  return usd * rates.usdToNgn;
}

export type UsageLevel = "ok" | "watch" | "over";

export function usageLevel(costNgn: number, planPriceNgn: number): UsageLevel {
  if (planPriceNgn <= 0) return "ok";
  const ratio = costNgn / planPriceNgn;
  if (ratio >= OVER_RATIO) return "over";
  if (ratio >= WATCH_RATIO) return "watch";
  return "ok";
}

export type MonthWindow = { fromIso: string; daysElapsed: number; daysInMonth: number };

// Lagos is UTC+1 all year (no daylight saving), and that is when a Nigerian business's
// month actually starts, so the window follows it rather than UTC.
export function lagosMonthWindow(now: Date = new Date()): MonthWindow {
  const HOUR = 3_600_000;
  const shifted = new Date(now.getTime() + HOUR); // "Lagos wall clock" stored as UTC fields
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth();
  const startUtcMs = Date.UTC(year, month, 1) - HOUR;
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const daysElapsed = Math.min(daysInMonth, Math.max(1, Math.ceil((now.getTime() - startUtcMs) / (24 * HOUR))));
  return { fromIso: new Date(startUtcMs).toISOString(), daysElapsed, daysInMonth };
}

export type BusinessCost = {
  businessId: string;
  messages: number;
  costToDateNgn: number;
  projectedNgn: number | null; // null until enough days have passed to extrapolate honestly
  level: UsageLevel;
  geminiShare: number; // 0..1 of messages served by the backup provider
};

export function summarizeUsage(rows: UsageRow[], rates: AiRates, planPriceNgn: number, window: MonthWindow): BusinessCost[] {
  const byBusiness = new Map<string, { messages: number; cost: number; gemini: number }>();
  for (const row of rows) {
    const entry = byBusiness.get(row.businessId) ?? { messages: 0, cost: 0, gemini: 0 };
    entry.messages += row.calls;
    entry.cost += rowCostNgn(row, rates);
    if (row.provider === "gemini") entry.gemini += row.calls;
    byBusiness.set(row.businessId, entry);
  }

  const canProject = window.daysElapsed >= MIN_DAYS_FOR_PROJECTION;
  const result: BusinessCost[] = [];
  for (const [businessId, entry] of byBusiness) {
    const projected = canProject ? (entry.cost / window.daysElapsed) * window.daysInMonth : null;
    result.push({
      businessId,
      messages: entry.messages,
      costToDateNgn: entry.cost,
      projectedNgn: projected,
      // Judge by the larger of what has been spent and where the month is heading.
      level: usageLevel(Math.max(entry.cost, projected ?? 0), planPriceNgn),
      geminiShare: entry.messages > 0 ? entry.gemini / entry.messages : 0,
    });
  }
  return result.sort((a, b) => b.costToDateNgn - a.costToDateNgn);
}

export function formatNgn(value: number): string {
  if (value < 1) return "₦0";
  return `₦${Math.round(value).toLocaleString("en-NG")}`;
}
