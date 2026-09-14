import type { AnalyticsSnapshot } from "@/lib/analytics/queries";

function RankedList({ items }: { items: Array<{ label: string; count: number }> | null }) {
  if (!items?.length) return <p className="text-sm text-slate-500">No data in this period.</p>;
  return (
    <ol className="space-y-2 text-sm">
      {items.map((item) => (
        <li key={item.label} className="flex items-center justify-between gap-3">
          <span className="truncate text-slate-700">{item.label}</span>
          <span className="font-semibold text-slate-900">{item.count}</span>
        </li>
      ))}
    </ol>
  );
}

export function BusinessInsights({ snapshot }: { snapshot: AnalyticsSnapshot }) {
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-900">Business insights</h2>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="glass-panel rounded-xl p-5">
          <h3 className="mb-3 text-sm font-semibold text-slate-800">Popular questions</h3>
          <RankedList items={snapshot.popularQuestions} />
        </section>
        <section className="glass-panel rounded-xl p-5">
          <h3 className="mb-3 text-sm font-semibold text-slate-800">Top products</h3>
          <RankedList items={snapshot.topProducts} />
        </section>
        <section className="glass-panel rounded-xl p-5">
          <h3 className="mb-3 text-sm font-semibold text-slate-800">Unanswered questions</h3>
          <p className="mb-3 text-2xl font-semibold text-slate-900">{snapshot.unansweredQuestions?.total ?? 0}</p>
          <RankedList items={snapshot.unansweredQuestions?.top ?? null} />
        </section>
        <section className="glass-panel rounded-xl p-5">
          <h3 className="mb-3 text-sm font-semibold text-slate-800">Conversation outcomes</h3>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div><dt className="text-slate-500">Resolution rate</dt><dd className="mt-1 font-semibold text-emerald-700">{snapshot.resolutionRate?.percentage ?? 0}%</dd></div>
            <div><dt className="text-slate-500">Reopen rate</dt><dd className="mt-1 font-semibold text-amber-700">{snapshot.reopenRate?.percentage ?? 0}%</dd></div>
          </dl>
        </section>
      </div>
    </section>
  );
}