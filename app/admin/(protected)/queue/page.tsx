import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { findStuckRows, STUCK_AFTER_MINUTES } from "@/lib/alerts/sweep";
import { retryMessageAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function QueuePage({ searchParams }: { searchParams: Promise<{ result?: string }> }) {
  const { result } = await searchParams;
  let rows: Awaited<ReturnType<typeof findStuckRows>> = [];
  let loadError: string | null = null;
  try {
    rows = await findStuckRows(createServiceRoleClient(), new Date());
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Unknown error";
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Message queue</h1>
        <p className="mt-1 text-sm text-slate-500">
          Customer messages (WhatsApp and email) that have gone unanswered for more than {STUCK_AFTER_MINUTES} minutes. Retry runs the same
          processing as a new message. A WhatsApp retry can, rarely, send the same reply twice if an earlier send was never confirmed.
        </p>
      </div>

      {result && <p className="rounded-lg border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-700" role="status">{result}</p>}
      {loadError && <p className="text-sm text-red-600">Couldn&apos;t load the queue: {loadError}</p>}

      {!loadError && rows.length === 0 ? (
        <p className="glass-panel rounded-xl p-5 text-sm text-slate-600">Nothing is stuck. Every recent message has been answered.</p>
      ) : (
        <div className="glass-panel overflow-x-auto rounded-xl">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Channel</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Attempts</th>
                <th className="px-4 py-3">Age</th>
                <th className="px-4 py-3">Last error</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.channel}-${row.id}`} className="border-t border-slate-200/70 align-top">
                  <td className="px-4 py-3 font-medium text-slate-800">{row.channel}</td>
                  <td className="px-4 py-3 text-slate-600">{row.status}</td>
                  <td className="px-4 py-3 tabular-nums text-slate-600">{row.attempts}</td>
                  <td className="px-4 py-3 tabular-nums text-slate-600">{row.ageMinutes < 120 ? `${row.ageMinutes} min` : `${Math.round(row.ageMinutes / 60)} h`}</td>
                  <td className="max-w-md px-4 py-3 text-xs text-slate-500">{row.lastError ?? "-"}</td>
                  <td className="px-4 py-3 text-right">
                    <form action={retryMessageAction}>
                      <input type="hidden" name="channel" value={row.channel === "WhatsApp" ? "whatsapp" : "email"} />
                      <input type="hidden" name="id" value={row.id} />
                      <button type="submit" className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-110 active:scale-95">Retry</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
