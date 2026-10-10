// Shown the instant a sidebar link is tapped, while the next page's data loads. Next.js
// also prefetches this shell for links in view, so navigation responds immediately
// instead of waiting on the server.
function Block({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-ink/[0.06] motion-reduce:animate-none ${className}`} />;
}

export default function PortalBusinessLoading() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading">
      <div className="space-y-2">
        <Block className="h-7 w-48" />
        <Block className="h-4 w-72 max-w-full" />
      </div>
      <Block className="h-40" />
      <div className="grid gap-4 sm:grid-cols-3">
        <Block className="h-28" />
        <Block className="h-28" />
        <Block className="h-28" />
      </div>
      <Block className="h-56" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
