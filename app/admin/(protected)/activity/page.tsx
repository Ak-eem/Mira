import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, formatRelativeTime } from "@/lib/format";
import { ErrorNotice } from "@/components/ErrorNotice";
import { PageHeader } from "@/components/ui/PageHeader";

type ActivityRow = {
  id: string;
  business_id: string;
  entity_type: string;
  action: string;
  summary: string;
  source: "admin_ui" | "command_center" | "portal_command";
  created_at: string;
};

export const metadata = { title: "Activity" };

const SOURCE_LABEL: Record<string, string> = { admin_ui: "Admin panel", command_center: "Command Center (admin)", portal_command: "The owner's dashboard" };

export default async function PlatformActivityPage() {
  const supabase = await createClient();
  const [{ data: activity, error }, { data: businesses, error: businessesError }] = await Promise.all([
    supabase
      .from("activity_log")
      .select("id, business_id, entity_type, action, summary, source, created_at")
      .order("created_at", { ascending: false })
      .limit(100)
      .returns<ActivityRow[]>(),
    supabase.from("businesses").select("id, name"),
  ]);

  const businessNameById = new Map((businesses ?? []).map((b) => [b.id, b.name as string]));

  return (
    <div>
      <PageHeader title="Activity" subtitle={<>The last 100 changes across every business — services, FAQs, policies, hours, promotions, and closures being created, edited, or removed.</>} />

      {error && <ErrorNotice what="load activity" error={error} />}
      {businessesError && <ErrorNotice what="load business names" error={businessesError} />}

      {!error && !businessesError && (!activity || activity.length === 0) && (
        <p className="text-sm text-slate-500">Nothing has changed yet.</p>
      )}

      {!error && !businessesError && activity && activity.length > 0 && (
        <div className="glass-panel divide-y divide-teal-900/10 overflow-hidden rounded-xl">
          {activity.map((a) => (
            <details key={a.id} className="group">
              <summary className="glass-hover flex cursor-pointer list-none items-start justify-between gap-3 px-4 py-3 text-sm [&::-webkit-details-marker]:hidden">
                <span className="flex min-w-0 items-start gap-2">
                  <span aria-hidden className="mt-0.5 text-slate-400 transition-transform group-open:rotate-90">&#8250;</span>
                  <span className="min-w-0">
                    <span className="font-medium text-slate-700">{businessNameById.get(a.business_id) ?? "Unknown business"}</span>
                    <span className="text-slate-400"> — </span>
                    {a.summary}
                  </span>
                </span>
                <span className="whitespace-nowrap pl-3 text-xs text-slate-500">{formatRelativeTime(a.created_at)}</span>
              </summary>
              <div className="space-y-3 bg-white/40 px-4 py-3 pl-10 text-xs text-slate-600">
                <p className="break-words text-sm text-slate-800">{a.summary}</p>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                  <dt className="text-slate-500">When</dt><dd>{formatDateTime(a.created_at)}</dd>
                  <dt className="text-slate-500">What</dt><dd className="capitalize">{a.entity_type.replace(/_/g, " ")} {a.action}</dd>
                  <dt className="text-slate-500">Made from</dt><dd>{SOURCE_LABEL[a.source] ?? a.source}</dd>
                </dl>
                <div className="flex flex-wrap gap-4 font-medium">
                  <Link href={`/admin/businesses/${a.business_id}`} className="text-accent hover:underline">Open this business</Link>
                  <Link href={`/admin/businesses/${a.business_id}/activity`} className="text-accent hover:underline">All of its activity</Link>
                </div>
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
