import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Skeleton } from "@/components/Skeleton";
import {
  formatNgn,
  formatUsd,
  lagosMonthWindow,
  planPriceFromEnv,
  planPriceUsd,
  ratesFromEnv,
  summarizeUsage,
  type AiProvider,
  type UsageLevel,
  type UsageRow,
} from "@/lib/admin/aiCost";

// Admin-only. An estimate, in US dollars, of what each business's AI usage costs us this month, so a
// business that is getting expensive relative to its plan is visible before it matters.
// It restricts nothing, and it is intentionally not on the client portal.
//
// Uses the RLS-respecting client: get_ai_usage_by_business is SECURITY INVOKER, so rows
// only come back because the current session passes is_platform_admin().

type RpcRow = { business_id: string; provider: string; calls: number | string; input_tokens: number | string; output_tokens: number | string };

const LEVEL_BADGE: Record<Exclude<UsageLevel, "ok">, { label: string; className: string }> = {
  watch: { label: "Watch", className: "bg-amber-100 text-amber-800" },
  over: { label: "Over plan", className: "bg-red-100 text-red-700" },
};

export async function AiCostCard() {
  const supabase = await createClient();
  const rates = ratesFromEnv();
  const planPrice = planPriceFromEnv();
  const planUsd = planPriceUsd(planPrice, rates);
  const window = lagosMonthWindow();

  const { data, error } = await supabase.rpc("get_ai_usage_by_business", { p_from: window.fromIso });

  if (error) {
    return (
      <section className="glass-panel rounded-xl p-5">
        <p className="font-medium text-slate-900">AI cost this month</p>
        <p className="mt-1 text-sm text-slate-500">
          Couldn&apos;t load the estimate. If this is new, run <code className="rounded bg-slate-100 px-1">0074_ai_usage_by_business.sql</code> in the Supabase SQL editor.
        </p>
      </section>
    );
  }

  const rows: UsageRow[] = ((data ?? []) as RpcRow[])
    .filter((r) => r.provider === "groq" || r.provider === "gemini")
    .map((r) => ({
      businessId: r.business_id,
      provider: r.provider as AiProvider,
      calls: Number(r.calls),
      inputTokens: Number(r.input_tokens),
      outputTokens: Number(r.output_tokens),
    }));

  const summary = summarizeUsage(rows, rates, planPrice, window);

  // Names for every business in the list. Fetched by table (not by a long list of ids)
  // so the request stays small however many businesses there are.
  const { data: businesses } = summary.length
    ? await supabase.from("businesses").select("id, name")
    : { data: [] as { id: string; name: string }[] };
  const nameById = new Map((businesses ?? []).map((b) => [b.id, b.name]));

  const totalToDate = summary.reduce((sum, s) => sum + s.costToDateUsd, 0);
  const flagged = summary.filter((s) => s.level !== "ok").length;

  return (
    <section className="glass-panel rounded-xl p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="font-medium text-slate-900">AI cost this month</p>
        <p className="text-sm text-slate-500">
          {summary.length === 0
            ? "No AI replies yet this month"
            : `${formatUsd(totalToDate)} so far${flagged > 0 ? ` · ${flagged} to watch` : ""}`}
        </p>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Estimate for you only; businesses don&apos;t see this. In US dollars, so it doesn&apos;t move with the naira. Day {window.daysElapsed} of {window.daysInMonth}.
      </p>

      {summary.length > 0 && (
        <div className="mt-3 max-h-72 overflow-auto rounded-lg" tabIndex={0} role="region" aria-label="AI cost by business, scrollable">
          <table className="w-full min-w-[480px] text-sm">
            <thead className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm">
              <tr className="text-left text-xs text-slate-500">
                <th className="py-2 pr-3 font-medium">Business</th>
                <th className="py-2 pr-3 text-right font-medium">Messages</th>
                <th className="py-2 pr-3 text-right font-medium">So far</th>
                <th className="py-2 pr-3 text-right font-medium">Projected</th>
                <th className="py-2 pr-3 text-right font-medium">Of plan</th>
                <th className="py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {summary.map((s) => {
                const basis = s.projectedUsd ?? s.costToDateUsd;
                const badge = s.level === "ok" ? null : LEVEL_BADGE[s.level];
                return (
                  <tr key={s.businessId} className="border-t border-slate-200/70">
                    <td className="py-2 pr-3">
                      <Link href={`/admin/businesses/${s.businessId}`} className="font-medium text-slate-900 hover:underline">
                        {nameById.get(s.businessId) ?? "Unknown business"}
                      </Link>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-slate-600">{s.messages.toLocaleString("en-NG")}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-slate-900">{formatUsd(s.costToDateUsd)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-slate-600">{s.projectedUsd === null ? "–" : formatUsd(s.projectedUsd)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-slate-600">{Math.round((basis / planUsd) * 100)}%</td>
                    <td className="py-2 text-right">
                      {badge && <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>{badge.label}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-xs text-slate-500">
        Costs use Groq&apos;s published token prices; the Gemini backup uses an assumed rate. &ldquo;Of plan&rdquo; compares with the {formatNgn(planPrice)} plan at {`\u20A6${rates.usdToNgn.toLocaleString("en-NG")}`} to the dollar (about {formatUsd(planUsd)}), using the projected month-end figure once there are 3 days of data; change the rate with AI_USD_TO_NGN.
        Businesses on the promo price or a 6 or 12 month plan pay you less per month, so their share is higher than shown.
      </p>
    </section>
  );
}

export function AiCostCardSkeleton() {
  return (
    <div className="glass-panel rounded-xl p-5" aria-hidden="true">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="mt-3 h-3 w-72" />
      <Skeleton className="mt-4 h-24 w-full" />
    </div>
  );
}
