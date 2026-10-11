import Link from "next/link";
import { explainAiError } from "@/lib/ai/providerError";
import type { RecentAiError } from "@/lib/analytics/queries";

// Each row expands to what happened, what it means, and where to look next. Native <details>: no client JS.
export function RecentAiErrors({ errors }: { errors: RecentAiError[] }) {
  if (errors.length === 0) return null;
  return (
    <section className="rounded-xl border border-red-200 bg-red-50/70 p-5">
      <h2 className="text-sm font-semibold text-red-900">Recent AI errors</h2>
      <p className="mb-3 text-xs text-red-700/70">Click an error for details.</p>
      <ul className="space-y-2">
        {errors.map((error) => {
          const explained = explainAiError(error.error_code, error.provider);
          const conversationHref = error.business_id && error.conversation_id ? `/admin/businesses/${error.business_id}/conversations/${error.conversation_id}` : null;
          return (
            <li key={error.id}>
              <details className="group rounded-lg border border-red-100 bg-white/70 px-3 py-2 open:border-red-200">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm text-red-800 [&::-webkit-details-marker]:hidden">
                  <span className="flex items-center gap-2">
                    <span aria-hidden className="text-red-400 transition-transform group-open:rotate-90">&#8250;</span>
                    {explained.title}
                  </span>
                  <time className="shrink-0 text-xs text-red-600">{new Date(error.created_at).toLocaleString()}</time>
                </summary>
                <div className="mt-3 space-y-2 text-xs text-slate-700">
                  <p>{explained.hint}</p>
                  {error.error_message ? (
                    <p className="break-words rounded-md bg-slate-50 p-2 font-mono text-[11px] text-slate-600">{error.error_message}</p>
                  ) : (
                    <p className="text-slate-400">No provider message was recorded for this one.</p>
                  )}
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-slate-500">
                    <dt>Provider</dt><dd>{error.provider}</dd>
                    <dt>Code</dt><dd className="font-mono">{error.error_code ?? "none"}</dd>
                    {error.business_name && (<><dt>Business</dt><dd>{error.business_name}</dd></>)}
                    {error.channel && (<><dt>Channel</dt><dd>{error.channel}</dd></>)}
                    {error.latency_ms !== null && (<><dt>Took</dt><dd>{(error.latency_ms / 1000).toFixed(1)} s before failing</dd></>)}
                  </dl>
                  {conversationHref && <Link href={conversationHref} className="inline-block font-medium text-accent hover:underline">Open the conversation</Link>}
                </div>
              </details>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
