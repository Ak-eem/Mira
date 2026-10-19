import type React from "react";
import Link from "next/link";
import type { AnalyticsRange, AnalyticsSnapshot } from "@/lib/analytics/queries";
import { Suspense } from "react";
import { SystemHealthCard, SystemHealthSkeleton } from "./SystemHealthCard";
import { RecentAiErrors } from "./RecentAiErrors";
import { InteractiveBarChart } from "./InteractiveBarChart";

const RANGE_OPTIONS: Array<{ value: AnalyticsRange; label: string }> = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "month", label: "This month" },
];

function Metric({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return (
    <div className="glass-panel rounded-xl p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
      {detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}
    </div>
  );
}

function BarChart(props: { title: string; points: Array<{ label: string; value: number; secondary?: number }>; seriesNames?: string[]; suffix?: string }) {
  return <InteractiveBarChart {...props} />;
}

export function AnalyticsPanel({ snapshot, baseHref, businessName }: { snapshot: AnalyticsSnapshot; baseHref: string; businessName?: string }) {
  const successRate = snapshot.successfulResponses + snapshot.failedResponses > 0
    ? `${Math.round((snapshot.successfulResponses / (snapshot.successfulResponses + snapshot.failedResponses)) * 100)}%`
    : "-";
  const escalationRate = snapshot.conversations > 0 ? `${Math.round((snapshot.humanHelp / snapshot.conversations) * 100)}%` : "-";
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          {businessName && <p className="text-xs font-medium uppercase tracking-wide text-accent">{businessName}</p>}
          <h1 className="text-xl font-semibold text-slate-900">{businessName ? "Business Analytics" : "Mira Analytics"}</h1>
          <p className="mt-1 text-sm text-slate-500">{businessName ? "Performance for this selected business only." : "Platform-wide performance across every business."}</p>
        </div>
        <div className="flex flex-wrap gap-1 rounded-lg border border-teal-900/10 bg-white/60 p-1">
          {RANGE_OPTIONS.map((option) => (
            <Link key={option.value} href={`${baseHref}?range=${option.value}`} className={`rounded-md px-2.5 py-1.5 text-xs ${snapshot.range === option.value ? "bg-accent text-white" : "text-slate-500 hover:bg-white"}`}>
              {option.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Customer conversations" value={snapshot.conversations} />
        <Metric label="Messages processed" value={snapshot.messages} />
        <Metric label="AI success rate" value={successRate} />
        <Metric label="Average response" value={snapshot.averageLatencyMs === null ? "-" : `${snapshot.averageLatencyMs}ms`} />
        <Metric label="Active businesses" value={snapshot.activeBusinesses === null ? "-" : snapshot.activeBusinesses} detail={businessName ? undefined : "Currently enabled"} />
        <Metric label="Human escalation" value={escalationRate} />
        <Metric label="Failed responses" value={snapshot.failedResponses} />
        <Metric label="API tokens" value={snapshot.apiTokens === null ? "unavailable" : snapshot.apiTokens.toLocaleString()} detail={snapshot.apiTokens === null ? "Provider usage not reported" : "Recorded usage"} />
        <Metric
          label="Closed conversations"
          value={snapshot.conversations > 0 ? `${Math.round((snapshot.closedConversations / snapshot.conversations) * 100)}%` : "-"}
          detail={`${snapshot.closedConversations} of ${snapshot.conversations} -- closed via any route, not necessarily resolved`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <BarChart title="Conversations over time" seriesNames={["Conversations", "Human help"]} points={snapshot.conversationsOverTime} />
        <BarChart title="Human help over time" seriesNames={["Human help requests"]} points={snapshot.conversationsOverTime.map((point) => ({ label: point.label, value: point.secondary ?? 0 }))} />
        <BarChart title="AI provider usage" seriesNames={["AI replies"]} points={snapshot.providerBreakdown} />
        <section className="glass-panel rounded-xl p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-800">AI performance</h2>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div><dt className="text-slate-500">Successful responses</dt><dd className="mt-1 font-semibold text-emerald-700">{snapshot.successfulResponses}</dd></div>
            <div><dt className="text-slate-500">Fallback responses</dt><dd className="mt-1 font-semibold text-sky-700">{snapshot.fallbackResponses}</dd></div>
            <div><dt className="text-slate-500">Groq primary/used</dt><dd className="mt-1 font-semibold text-slate-900">{snapshot.groqResponses}</dd></div>
            <div><dt className="text-slate-500">Gemini fallback/used</dt><dd className="mt-1 font-semibold text-slate-900">{snapshot.geminiResponses}</dd></div>
          </dl>
        </section>
      </div>

      {businessName && (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="glass-panel rounded-xl p-5">
            <h2 className="mb-4 text-sm font-semibold text-slate-800">Popular products</h2>
            {snapshot.popularProducts.length === 0 ? (
              <p className="text-sm text-slate-500">No product mentions in this period.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {snapshot.popularProducts.map((p) => (
                  <li key={p.productName} className="flex items-center justify-between gap-3">
                    <span className="truncate text-slate-700">{p.productName}</span>
                    <span className="shrink-0 font-semibold text-slate-900">{p.mentionCount}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="glass-panel rounded-xl p-5">
            <h2 className="mb-1 text-sm font-semibold text-slate-800">Recent unanswered questions</h2>
            <p className="mb-3 text-xs text-slate-500">Customers whose question got the default &quot;I don&apos;t have that information&quot; reply -- worth adding to FAQs or products.</p>
            {snapshot.recentUnansweredQuestions.length === 0 ? (
              <p className="text-sm text-slate-500">No unanswered questions in this period.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {snapshot.recentUnansweredQuestions.map((q, i) => (
                  <li key={i} className="border-b border-slate-100 pb-2 last:border-0 last:pb-0">
                    <p className="text-slate-700">&quot;{q.question}&quot;</p>
                    <time className="text-xs text-slate-400">{new Date(q.askedAt).toLocaleString()}</time>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      <Suspense fallback={<SystemHealthSkeleton />}>
        <SystemHealthCard />
      </Suspense>

      <RecentAiErrors errors={snapshot.recentErrors} />
    </div>
  );
}