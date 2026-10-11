import { describeError } from "@/lib/errorInfo";

/**
 * An inline error that says what failed, why, and what to try. Use it instead of a bare red sentence.
 * `what` is the thing the page was doing ("load flagged conversations"); `error` is whatever came back.
 */
export function ErrorNotice({ what, error }: { what: string; error: unknown }) {
  const info = describeError(error);
  return (
    <div role="alert" className="rounded-xl border border-red-200 bg-red-50/80 p-4 text-sm">
      <p className="font-semibold text-red-800">Couldn&apos;t {what}</p>
      <p className="mt-1 text-red-700">{info.message}</p>
      <p className="mt-2 text-slate-600">{info.hint}</p>
      {(info.code || info.details) && (
        <p className="mt-2 font-mono text-xs text-slate-500">
          {info.code && <span>code {info.code}</span>}
          {info.code && info.details && <span> &middot; </span>}
          {info.details && <span>{info.details}</span>}
        </p>
      )}
    </div>
  );
}
