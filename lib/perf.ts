// Tiny timing + caching helpers for finding out what is actually slow.
//
// timed(): logs "[perf] label 842ms" for anything slower than SLOW_MS (default 500), and for everything when
// PERF_LOG=1. Look for these lines in the Vercel function logs. It never changes the result or swallows errors.

const SLOW_MS = Number(process.env.PERF_SLOW_MS ?? 500);

export async function timed<T>(label: string, work: PromiseLike<T> | (() => PromiseLike<T> | T)): Promise<T> {
  const started = Date.now();
  try {
    return await (typeof work === "function" ? work() : work);
  } finally {
    const ms = Date.now() - started;
    if (process.env.PERF_LOG === "1" || ms >= SLOW_MS) console.log(`[perf] ${label} ${ms}ms`);
  }
}

/**
 * Remembers the result of an async function for `ttlMs`. A failure is never cached, and concurrent callers
 * share one in-flight call. Per server instance only (serverless instances are short-lived), so it smooths
 * bursts rather than guaranteeing freshness.
 */
export function memoizeFor<T>(ttlMs: number, fn: () => Promise<T>, now: () => number = Date.now): () => Promise<T> {
  let cached: { at: number; value: T } | null = null;
  let inflight: Promise<T> | null = null;
  return async () => {
    if (cached && now() - cached.at < ttlMs) return cached.value;
    if (inflight) return inflight;
    inflight = fn()
      .then((value) => {
        cached = { at: now(), value };
        return value;
      })
      .finally(() => {
        inflight = null;
      });
    return inflight;
  };
}
