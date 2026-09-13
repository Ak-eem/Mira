import Link from "next/link";
import type { AnalyticsRange, AnalyticsSnapshot } from "@/lib/analytics/queries";

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

function BarChart({ title, points, suffix = "" }: { title: string; points: Array<{ label: string; value: number; secondary?: number }>; suffix?: string }) {
  const maximum = Math.max(...points.map((point) => point.value), 1);
  return (
    <section className="glass-panel rounded-xl p-5">
      <h2 className="mb-4 text-sm font-semibold text-slate-800">{title}</h2>
      {points.length === 0 ? (
        <p className="text-sm text-slate-500">No data in this period.</p>
      ) : (
        <div className="flex h-40 items-end gap-2">
          {points.map((point) => (
            <div key={point.label} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <span className="text-[10px] text-slate-500">{point.value}{suffix}</span>
              <div className="flex h-28 w-full items-end gap-0.5">
                <div className="w-full rounded-t bg-accent/80" style={{ height: `${Math.max((point.value / maximum) * 100, point.value ? 4 : 0)}%` }} />
                {point.secondary !== undefined && <div className="w-full rounded-t bg-amber-400/80" style={{ height: `${Math.max((point.secondary / maximum) * 100, point.secondary ? 4 : 0)}%` }} />}
              </div>
              <span className="max-w-full truncate text-[10px] text-slate-400">{point.label}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
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
        <Metric label="Active businesses" value={businessName ? "-" : "See dashboard"} detail={businessName ? undefined : "Cross-business count"} />
        <Metric label="Human escalation" value={escalationRate} />
        <Metric label="Failed responses" value={snapshot.failedResponses} />
        <Metric label="API tokens" value={snapshot.apiTokens === null ? "-" : snapshot.apiTokens.toLocaleString()} detail={snapshot.apiTokens === null ? "Telemetry pending" : "Recorded usage"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <BarChart title="Conversations over time" points={snapshot.conversationsOverTime} />
        <BarChart title="Human help over time" points={snapshot.conversationsOverTime.map((point) => ({ label: point.label, value: point.secondary ?? 0 }))} />
        <BarChart title="AI provider usage" points={snapshot.providerBreakdown} />
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

      <section className="glass-panel rounded-xl p-5">
        <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold text-slate-800">System health</h2><span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700">Operational</span></div>
        <div className="grid gap-3 text-sm sm:grid-cols-3"><p><span className="text-slate-500">Database</span><br /><span className="font-medium text-emerald-700">Operational</span></p><p><span className="text-slate-500">AI providers</span><br /><span className="font-medium text-emerald-700">Monitored</span></p><p><span className="text-slate-500">Background jobs</span><br /><span className="font-medium text-slate-700">No health check recorded</span></p></div>
      </section>

      {snapshot.recentErrors.length > 0 && <section className="rounded-xl border border-red-200 bg-red-50/70 p-5"><h2 className="mb-3 text-sm font-semibold text-red-900">Recent AI errors</h2><ul className="space-y-2 text-sm text-red-800">{snapshot.recentErrors.map((error) => <li key={error.id} className="flex justify-between gap-3"><span>{error.provider}: {error.error_code ?? "Provider error"}</span><time className="text-xs text-red-600">{new Date(error.created_at).toLocaleString()}</time></li>)}</ul></section>}
    </div>
  );
}