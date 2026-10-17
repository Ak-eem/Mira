import { getSystemHealth, type HealthStatus } from "@/lib/systemHealth";
import { timed } from "@/lib/perf";
import { formatDateTime } from "@/lib/format";
import { ErrorNotice } from "@/components/ErrorNotice";
import { Skeleton } from "@/components/Skeleton";

const BADGE: Record<HealthStatus, string> = {
  Operational: "bg-emerald-100 text-emerald-700",
  Degraded: "bg-amber-100 text-amber-700",
  Down: "bg-red-100 text-red-700",
  "Not configured": "bg-slate-100 text-slate-600",
};

function Item({ label, check }: { label: string; check: { status: HealthStatus; checkedAt: string; detail?: string; hint?: string } }) {
  return (
    <details className="group rounded-lg border border-transparent px-2 py-1.5 transition open:border-slate-200 open:bg-white/60 hover:bg-white/50">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm [&::-webkit-details-marker]:hidden">
        <span>
          <span className="block text-slate-500">{label}</span>
          <span className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${BADGE[check.status]}`}>{check.status}</span>
        </span>
        <span aria-hidden className="text-slate-400 transition-transform group-open:rotate-90">&#8250;</span>
      </summary>
      <div className="mt-2 space-y-1.5 text-xs">
        {check.detail && <p className="text-slate-700">{check.detail}</p>}
        {check.hint && <p className="rounded-md bg-slate-50 p-2 text-slate-600"><span className="font-semibold">What to do: </span>{check.hint}</p>}
        <time className="block text-slate-400">Checked {formatDateTime(check.checkedAt)}</time>
      </div>
    </details>
  );
}

// Streams in after the rest of the analytics page: the AI-provider check is a live network call and must
// never hold the page back. (The badge colours now follow the real status; it used to be green regardless.)
export async function SystemHealthCard() {
  let health;
  try {
    health = await timed("health:all", getSystemHealth());
  } catch (error) {
    return <ErrorNotice what="check system health" error={error} />;
  }
  return (
    <section className="glass-panel rounded-xl p-5">
      <h2 className="mb-1 text-sm font-semibold text-slate-800">System health</h2>
      <p className="mb-3 text-xs text-slate-400">Click a check for details.</p>
      <div className="grid items-start gap-3 sm:grid-cols-3">
        <Item label="Database" check={health.database} />
        <Item label="AI providers" check={health.aiProvider} />
        <Item label="Background jobs" check={health.backgroundJobs} />
      </div>
    </section>
  );
}

export function SystemHealthSkeleton() {
  return (
    <section className="glass-panel rounded-xl p-5" aria-hidden="true">
      <Skeleton className="mb-4 h-4 w-28" />
      <div className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-5 w-24 rounded-full" />
            <Skeleton className="h-3 w-36" />
          </div>
        ))}
      </div>
    </section>
  );
}
