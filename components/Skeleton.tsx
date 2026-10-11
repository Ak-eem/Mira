import type { CSSProperties, ReactNode } from "react";

/** A single shimmering placeholder block. Size it with className (h-4 w-24 ...). */
export function Skeleton({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return <div aria-hidden="true" className={`skeleton ${className}`} style={style} />;
}

/** Wraps a loading screen so assistive tech announces it once instead of reading every block. */
export function LoadingScreen({ label = "Loading", children }: { label?: string; children: ReactNode }) {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className="space-y-6">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

export function SkeletonHeading({ subtitle = true }: { subtitle?: boolean }) {
  return (
    <div className="space-y-2">
      <Skeleton className="h-6 w-48" />
      {subtitle && <Skeleton className="h-4 w-80 max-w-full" />}
    </div>
  );
}

export function SkeletonStats({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="glass-panel rounded-xl p-5">
          <Skeleton className="h-8 w-16" />
          <Skeleton className="mt-3 h-3 w-24" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonPanel({ lines = 4, title = true }: { lines?: number; title?: boolean }) {
  return (
    <div className="glass-panel rounded-xl p-5">
      {title && <Skeleton className="mb-4 h-4 w-40" />}
      <div className="space-y-3">
        {Array.from({ length: lines }, (_, i) => (
          <Skeleton key={i} className={`h-4 ${i % 3 === 0 ? "w-full" : i % 3 === 1 ? "w-5/6" : "w-2/3"}`} />
        ))}
      </div>
    </div>
  );
}

export function SkeletonChart() {
  const heights = [45, 70, 35, 85, 55, 95, 60];
  return (
    <div className="glass-panel rounded-xl p-5">
      <Skeleton className="mb-4 h-4 w-44" />
      <div className="flex h-28 items-end gap-2">
        {heights.map((h, i) => (
          <Skeleton key={i} className="flex-1 rounded-b-none" style={{ height: `${h}%` }} />
        ))}
      </div>
    </div>
  );
}

export function SkeletonTable({ rows = 6, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="glass-panel overflow-hidden rounded-xl">
      <div className="flex gap-4 px-4 py-3">
        {Array.from({ length: columns }, (_, c) => (
          <Skeleton key={c} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex items-center gap-4 border-t border-slate-200/70 px-4 py-4">
          {Array.from({ length: columns }, (_, c) => (
            <Skeleton key={c} className={`h-4 flex-1 ${c === columns - 1 ? "max-w-16" : ""}`} />
          ))}
        </div>
      ))}
    </div>
  );
}
