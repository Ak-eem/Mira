import Link from "next/link";
import { loadIssues, type Issue } from "@/lib/admin/issues";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { ErrorNotice } from "@/components/ErrorNotice";
import { Skeleton } from "@/components/Skeleton";

function ago(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 48 * 60) return `${Math.round(minutes / 60)} h ago`;
  return `${Math.round(minutes / 1440)} d ago`;
}

function Row({ issue }: { issue: Issue }) {
  const body = (
    <div className="flex items-start gap-3 py-3">
      <span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${issue.severity === "error" ? "bg-red-500" : "bg-amber-400"}`} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-800">{issue.title}</p>
        <p className="mt-0.5 break-words text-xs text-slate-500">{issue.detail}</p>
      </div>
      <span className="shrink-0 text-xs text-slate-400">{ago(issue.when)}</span>
    </div>
  );
  return issue.href ? <Link href={issue.href} className="glass-hover -mx-2 block rounded-lg px-2">{body}</Link> : <div>{body}</div>;
}

// Dashboard panel: what is going wrong right now, in plain words. Rendered inside <Suspense>.
export async function SystemIssues() {
  let issues: Issue[];
  try {
    issues = await loadIssues(createServiceRoleClient());
  } catch (error) {
    return <ErrorNotice what="check for system problems" error={error} />;
  }
  if (issues.length === 0) {
    return (
      <div className="glass-panel flex items-center gap-3 rounded-xl p-5">
        <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
        <p className="text-sm text-slate-600">No problems in the last 24 hours. Every customer message has been answered and AI replies are succeeding.</p>
      </div>
    );
  }
  const errors = issues.filter((issue) => issue.severity === "error").length;
  return (
    <div className={`rounded-xl border p-5 ${errors > 0 ? "border-red-200 bg-red-50/60" : "border-amber-200 bg-amber-50/60"}`}>
      <div className="mb-1 flex items-center justify-between">
        <p className="font-medium text-slate-900">{issues.length} problem{issues.length === 1 ? "" : "s"} need a look</p>
        <Link href="/admin/queue" className="text-xs font-medium text-accent hover:underline">Message queue</Link>
      </div>
      <div className="divide-y divide-slate-200/70">
        {issues.slice(0, 8).map((issue) => <Row key={issue.id} issue={issue} />)}
      </div>
      {issues.length > 8 && <p className="mt-2 text-xs text-slate-500">and {issues.length - 8} more</p>}
    </div>
  );
}

export function SystemIssuesSkeleton() {
  return (
    <div className="glass-panel rounded-xl p-5" aria-hidden="true">
      <Skeleton className="mb-4 h-4 w-48" />
      <div className="space-y-4">
        {[0, 1].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-2 w-2 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-56 max-w-full" />
              <Skeleton className="h-3 w-80 max-w-full" />
            </div>
            <Skeleton className="h-3 w-12" />
          </div>
        ))}
      </div>
    </div>
  );
}
