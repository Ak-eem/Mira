function Block({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-slate-900/[0.06] motion-reduce:animate-none ${className}`} />;
}

export default function AdminLoading() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading">
      <Block className="h-7 w-40" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Block className="h-24" />
        <Block className="h-24" />
        <Block className="h-24" />
        <Block className="h-24" />
      </div>
      <Block className="h-48" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
