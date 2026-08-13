// In-memory rate limiter for /api/chat. Resets whenever the server
// restarts -- a real limitation, not hidden here, but it's genuine
// protection against the actual risk at this stage (one person or a
// stray script hammering the endpoint and burning the free Gemini
// tier for everyone), without needing a paid external store.
const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 20; // per identifier, per window -- generous enough that
// fast single-person testing won't trip it, but nowhere near what a
// scripted abuse attempt would send in the same window

type Bucket = { count: number; windowStart: number };
const buckets = new Map<string, Bucket>();

export function checkRateLimit(identifier: string): {
  allowed: boolean;
  retryAfterSeconds?: number;
} {
  const now = Date.now();
  const bucket = buckets.get(identifier);

  if (!bucket || now - bucket.windowStart > WINDOW_MS) {
    buckets.set(identifier, { count: 1, windowStart: now });
    return { allowed: true };
  }

  if (bucket.count >= MAX_REQUESTS) {
    const retryAfterSeconds = Math.ceil((WINDOW_MS - (now - bucket.windowStart)) / 1000);
    return { allowed: false, retryAfterSeconds };
  }

  bucket.count += 1;
  return { allowed: true };
}
