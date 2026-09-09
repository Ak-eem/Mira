"use client";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-16 text-slate-100">
      <section className="glass-panel w-full max-w-lg rounded-3xl border border-cyan-300/20 bg-cyan-950/30 p-8 text-center shadow-2xl shadow-cyan-950/40 backdrop-blur-xl">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-cyan-200/30 bg-cyan-400/10 text-2xl font-bold text-cyan-200 shadow-lg shadow-cyan-500/20">
          M
        </div>
        <p className="mb-3 text-sm font-semibold uppercase tracking-[0.3em] text-cyan-300">Mira</p>
        <h1 className="mb-3 text-2xl font-semibold text-white">Something went wrong</h1>
        <p className="mb-8 text-sm leading-6 text-slate-300">
          Mira hit a temporary snag. Please try again, and we’ll get you back on track.
        </p>
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-xl border border-cyan-200/30 bg-cyan-400/20 px-5 py-3 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-300/30 focus:outline-none focus:ring-2 focus:ring-cyan-300/70"
        >
          Try again
        </button>
      </section>
    </main>
  );
}
