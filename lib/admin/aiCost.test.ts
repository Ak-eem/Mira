import { DEFAULT_RATES, formatNgn, formatUsd, lagosMonthWindow, planPriceFromEnv, planPriceUsd, ratesFromEnv, rowCostUsd, summarizeUsage, usageLevel, type UsageRow } from "./aiCost";

function check(condition: boolean, message: string): void {
  console.log(`${condition ? "PASS" : "FAIL"} - ${message}`);
  if (!condition) process.exitCode = 1;
}
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;

// --- pricing (dollars) ---
const groqRow: UsageRow = { businessId: "a", provider: "groq", calls: 1, inputTokens: 1_000_000, outputTokens: 1_000_000 };
check(near(rowCostUsd(groqRow, DEFAULT_RATES), 0.75), "1M in + 1M out on Groq prices to $0.75 ($0.15 + $0.60)");
check(near(rowCostUsd({ ...groqRow, inputTokens: 4500, outputTokens: 400 }, DEFAULT_RATES), (4500 * 0.15 + 400 * 0.6) / 1e6), "a typical message prices as input*rate + output*rate");
check(rowCostUsd({ ...groqRow, provider: "gemini" }, DEFAULT_RATES) > rowCostUsd(groqRow, DEFAULT_RATES), "the backup provider is priced higher by default");
check(rowCostUsd({ ...groqRow, inputTokens: 0, outputTokens: 0 }, DEFAULT_RATES) === 0, "no tokens costs nothing");
check(near(rowCostUsd(groqRow, { ...DEFAULT_RATES, usdToNgn: 2000 }), 0.75), "the dollar cost does not change when the naira exchange rate changes");

// --- environment overrides ---
check(ratesFromEnv({}).usdToNgn === 1400, "defaults apply with an empty environment");
check(ratesFromEnv({ AI_USD_TO_NGN: "1500" }).usdToNgn === 1500, "exchange rate can be overridden");
check(ratesFromEnv({ AI_USD_TO_NGN: "abc" }).usdToNgn === 1400, "a non-numeric override is ignored");
check(ratesFromEnv({ AI_USD_TO_NGN: "-5" }).usdToNgn === 1400 && ratesFromEnv({ AI_USD_TO_NGN: "0" }).usdToNgn === 1400, "zero or negative overrides are ignored");
check(ratesFromEnv({ AI_USD_TO_NGN: "  " }).usdToNgn === 1400, "a blank override is ignored");
check(ratesFromEnv({ AI_GEMINI_USD_PER_M_OUT: "2" }).gemini.outUsdPerMillion === 2, "provider prices can be overridden");

// --- plan price comes from the same setting as checkout, converted to dollars ---
check(planPriceFromEnv({}) === 50_000, "plan price falls back to the N50,000 list price");
check(planPriceFromEnv({ PAYSTACK_BASE_AMOUNT_NGN: "75000" }) === 75_000, "plan price follows PAYSTACK_BASE_AMOUNT_NGN");
check(planPriceFromEnv({ PAYSTACK_BASE_AMOUNT_NGN: "free" }) === 50_000 && planPriceFromEnv({ PAYSTACK_BASE_AMOUNT_NGN: "0" }) === 50_000, "an invalid or zero price setting is ignored");
check(near(planPriceUsd(50_000, DEFAULT_RATES), 50_000 / 1400), "N50,000 at N1,400/$ is about $35.71");
check(near(planPriceUsd(1400, DEFAULT_RATES), 1), "N1,400 at N1,400/$ is $1");

// --- flag thresholds (plan $100 for round numbers) ---
check(usageLevel(49.99, 100) === "ok", "just under half the plan is ok");
check(usageLevel(50, 100) === "watch", "half the plan is flagged watch");
check(usageLevel(99.99, 100) === "watch", "just under the whole plan is still watch");
check(usageLevel(100, 100) === "over", "the whole plan is flagged over");
check(usageLevel(0, 100) === "ok" && usageLevel(5, 0) === "ok", "no cost, or a zero plan price, is never flagged");

// --- Lagos month window (UTC+1) ---
const mid = lagosMonthWindow(new Date("2026-11-19T10:00:00Z"));
check(mid.fromIso === "2026-10-31T23:00:00.000Z", "November starts at 00:00 Lagos = 23:00 UTC on 31 October");
check(mid.daysInMonth === 30 && mid.daysElapsed === 19, "19 November is day 19 of 30");
const lastMinute = lagosMonthWindow(new Date("2026-10-31T22:59:00Z"));
check(lastMinute.fromIso === "2026-09-30T23:00:00.000Z" && lastMinute.daysInMonth === 31, "23:59 Lagos on 31 Oct is still October");
const firstMinute = lagosMonthWindow(new Date("2026-10-31T23:00:00Z"));
check(firstMinute.fromIso === "2026-10-31T23:00:00.000Z" && firstMinute.daysElapsed === 1, "00:00 Lagos on 1 Nov is day 1 of November");
check(lagosMonthWindow(new Date("2028-03-01T12:00:00Z")).daysInMonth === 31 && lagosMonthWindow(new Date("2028-02-10T12:00:00Z")).daysInMonth === 29, "leap-year February has 29 days");
check(lagosMonthWindow(new Date("2026-12-31T23:30:00Z")).fromIso === "2026-12-31T23:00:00.000Z", "year rollover starts January at 23:00 UTC on 31 Dec");

// --- summarising ---
const window5 = { fromIso: "", daysElapsed: 5, daysInMonth: 30 };
const rows: UsageRow[] = [
  { businessId: "cheap", provider: "groq", calls: 100, inputTokens: 450_000, outputTokens: 40_000 },
  { businessId: "heavy", provider: "groq", calls: 9000, inputTokens: 40_000_000, outputTokens: 3_600_000 },
  { businessId: "heavy", provider: "gemini", calls: 1000, inputTokens: 4_000_000, outputTokens: 400_000 },
];
const out = summarizeUsage(rows, DEFAULT_RATES, 50_000, window5);
check(out.length === 2 && out[0].businessId === "heavy", "businesses are sorted by cost, highest first");
check(out[0].messages === 10_000, "calls from both providers are added together");
check(near(out[0].geminiShare, 0.1), "backup-provider share is reported (1,000 of 10,000)");
check(out[0].projectedUsd !== null && near(out[0].projectedUsd, out[0].costToDateUsd / 5 * 30), "projection scales to the full month");
check(out[1].level === "ok", "the light business is ok");
const early = summarizeUsage(rows, DEFAULT_RATES, 50_000, { fromIso: "", daysElapsed: 2, daysInMonth: 30 });
check(early.every((r) => r.projectedUsd === null), "no projection in the first two days (too little data to extrapolate)");
const heading = summarizeUsage([{ businessId: "x", provider: "groq", calls: 1, inputTokens: 100_000_000, outputTokens: 0 }], DEFAULT_RATES, 50_000, window5);
check(heading[0].level === "over", "a business heading past the whole plan by month end is flagged over before it gets there");
check(summarizeUsage([], DEFAULT_RATES, 50_000, window5).length === 0, "no usage gives an empty list");
const cheaperDollar = summarizeUsage(rows, { ...DEFAULT_RATES, usdToNgn: 700 }, 50_000, window5);
check(near(cheaperDollar[0].costToDateUsd, out[0].costToDateUsd), "a different exchange rate does not change a business's dollar cost");

// --- formatting ---
check(formatUsd(0) === "$0.00" && formatUsd(-1) === "$0.00" && formatUsd(NaN) === "$0.00", "zero, negative and invalid amounts show as $0.00");
check(formatUsd(0.004) === "<$0.01", "under a cent shows as <$0.01 rather than $0.00");
check(formatUsd(0.01) === "$0.01" && formatUsd(0.075) === "$0.08", "cents are shown, rounded");
check(formatUsd(12.5) === "$12.50" && formatUsd(1234.567) === "$1,234.57", "dollars always show two decimals and group thousands");
check(formatNgn(0.4) === "₦0" && formatNgn(50_000) === "₦50,000", "naira formatting is kept for the plan price");
