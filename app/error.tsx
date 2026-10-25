"use client";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-6 py-16 text-slate-900">
      <section className="ui-card ui-enter w-full max-w-lg text-center !p-8">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-2xl font-semibold text-white" aria-hidden>
          M
        </div>
        <h1 className="ui-title">Something went wrong</h1>
        <p className="ui-subtitle mb-7 mt-2">Mira hit a temporary snag. Please try again, and we’ll get you back on track.</p>
        <button type="button" onClick={() => reset()} className="ui-btn ui-btn-primary">
          Try again
        </button>
      </section>
    </main>
  );
}
