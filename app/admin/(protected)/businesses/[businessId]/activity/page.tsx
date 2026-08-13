import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatRelativeTime } from "@/lib/format";

export default async function ActivityPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const supabase = await createClient();

  const { data: activity } = await supabase
    .from("activity_log")
    .select("id, entity_type, action, summary, source, created_at")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div>
      <Link href={`/admin/businesses/${businessId}`} className="text-sm text-slate-500 hover:underline">
        ← Back
      </Link>
      <h1 className="mb-6 mt-2 text-xl font-semibold">Activity</h1>

      {(!activity || activity.length === 0) && (
        <p className="text-sm text-slate-500">Nothing changed yet.</p>
      )}

      {activity && activity.length > 0 && (
        <ul className="space-y-1">
          {activity.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between rounded border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <span>
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
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
