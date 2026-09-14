import Link from "next/link";
import type { AnalyticsSnapshot } from "@/lib/analytics/queries";

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
    </div>
  );
}

export function AnalyticsStrip({ snapshot }: { snapshot: AnalyticsSnapshot }) {
  const responseTotal = snapshot.successfulResponses + snapshot.failedResponses;
  const successRate = responseTotal > 0
    ? `${Math.round((snapshot.successfulResponses / responseTotal) * 100)}%`
    : "-";

  return (
    <div className="glass-panel rounded-xl p-5">
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto] lg:items-center">
        <Metric label="Conversations" value={snapshot.conversations} />
        <Metric label="AI success rate" value={successRate} />
        <Metric label="Average response" value={snapshot.averageLatencyMs === null ? "-" : `${snapshot.averageLatencyMs}ms`} />
        <Metric label="API tokens" value={snapshot.apiTokens === null ? "unavailable" : snapshot.apiTokens.toLocaleString()} />
        <Link href="/admin/analytics" className="text-sm font-medium text-accent hover:underline lg:justify-self-end">
          Full analytics &rarr;
        </Link>
      </div>
    </div>
  );
}