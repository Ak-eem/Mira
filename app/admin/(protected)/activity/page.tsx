import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatRelativeTime } from "@/lib/format";

type ActivityRow = {
  id: string;
  business_id: string;
  entity_type: string;
  action: string;
  summary: string;
  source: "admin_ui" | "command_center";
  created_at: string;
};

export default async function PlatformActivityPage() {
  const supabase = await createClient();
  const [{ data: activity, error }, { data: businesses }] = await Promise.all([
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
      <h1 className="mb-4 text-xl font-semibold text-slate-900">Activity</h1>
      <p className="mb-4 text-sm text-slate-500">
        The last 100 changes across every business — services, FAQs, policies, hours,
        promotions, and closures being created, edited, or removed.
      </p>

      {error && <p className="text-sm text-red-600">Couldn&apos;t load activity: {error.message}</p>}

      {!error && (!activity || activity.length === 0) && (
        <p className="text-sm text-slate-500">Nothing has changed yet.</p>
      )}

      {!error && activity && activity.length > 0 && (
        <div className="glass-panel divide-y divide-teal-900/10 overflow-hidden rounded-xl">
          {activity.map((a) => (
            <Link
              key={a.id}
              href={`/admin/businesses/${a.business_id}/activity`}
              className="glass-hover flex items-center justify-between px-4 py-3 text-sm"
            >
              <span>
                <span className="font-medium text-slate-700">
                  {businessNameById.get(a.business_id) ?? "Unknown business"}
                </span>
                <span className="text-slate-400"> — </span>
                {a.summary}
                {a.source === "command_center" && (
                  <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                    via Command Center
                  </span>
                )}
              </span>
              <span className="whitespace-nowrap pl-3 text-xs text-slate-400">
                {formatRelativeTime(a.created_at)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
