"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { describeError } from "@/lib/errorInfo";

// Shared by the admin and portal error boundaries. Catches anything that throws while a page renders. In production Next.js replaces the real message of
// a server error with a generic one and a digest, so the digest is the key to find the cause in the server logs.
export function RouteError({ error, reset, homeHref, homeLabel, scope }: { error: Error & { digest?: string }; reset: () => void; homeHref: string; homeLabel: string; scope: string }) {
  const pathname = usePathname();
  const info = useMemo(() => describeError(error), [error]);
  const [copied, setCopied] = useState(false);
  const when = useMemo(() => new Date().toISOString(), []);

  useEffect(() => {
    console.error(`${scope} page error:`, error);
  }, [error, scope]);

  const report = [`Page: ${pathname}`, `Time: ${when}`, `Message: ${info.message}`, error.digest ? `Reference: ${error.digest}` : null].filter(Boolean).join("\n");

  return (
    <div role="alert" className="mx-auto max-w-2xl space-y-4">
      <div className="rounded-xl border border-red-200 bg-red-50/80 p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-red-700">Something went wrong on this page</p>
        <h1 className="mt-2 text-lg font-semibold text-slate-900">{info.message}</h1>
        <p className="mt-2 text-sm text-slate-600">{info.hint}</p>
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 font-mono text-xs text-slate-500">
          <dt>Page</dt><dd className="break-all">{pathname}</dd>
          <dt>Time</dt><dd>{when}</dd>
          {error.digest && (<><dt>Reference</dt><dd className="break-all">{error.digest}</dd></>)}
        </dl>
        {error.digest && <p className="mt-3 text-xs text-slate-500">The full error is in the server logs under this reference.</p>}
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" onClick={() => reset()} className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white transition hover:brightness-110 active:scale-95">Try again</button>
          <Link href={homeHref} className="glass-hover rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700">{homeLabel}</Link>
          <button
            type="button"
            onClick={() => { void navigator.clipboard?.writeText(report).then(() => setCopied(true)).catch(() => undefined); }}
            className="glass-hover rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700"
          >
            {copied ? "Copied" : "Copy details"}
          </button>
        </div>
      </div>
    </div>
  );
}
