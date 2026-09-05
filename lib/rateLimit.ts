// IN-MEMORY RATE LIMITER & SERVERLESS INFRASTRUCTURE LIMITATIONS
//
// ⚠️ VERCEL / SERVERLESS LIMITATION:
// This rate limiter uses an in-memory `Map` instance (`buckets`). On serverless
// hosting platforms like Vercel or AWS Lambda:
//   1. Each serverless function invocation may run on a separate container node.
//   2. In-memory state is isolated to a single warm container instance and resets
//      whenever the container scales down, restarts, or cold-starts.
//   3. Consequently, requests hitting different serverless instances will not share
//      bucket state, making this in-memory check non-guaranteed across distributed nodes.
//
// 📌 RECOMMENDED PRODUCTION FOLLOW-UP:
// For true production-grade rate limiting across distributed serverless instances,
// migrate to a centralized sliding-window store using Redis or Upstash Rate Limit
// (e.g. `@upstash/ratelimit` paired with `@upstash/redis`).
//
// 💡 CURRENT IN-MEMORY IMPROVEMENTS:
// - Supports explicit action/namespace key scoping (e.g. `${action}:${identifier}`).
// - Implements automatic expired bucket cleanup to prevent memory leaks in persistent instances.

const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 20; // per identifier, per window

type Bucket = { count: number; windowStart: number };
const buckets = new Map<string, Bucket>();

/**
 * Prunes expired buckets to prevent memory accumulation over time.
 */
function cleanupExpiredBuckets(now: number) {
  if (buckets.size > 500) {
    for (const [key, bucket] of buckets.entries()) {
      if (now - bucket.windowStart > WINDOW_MS) {
        buckets.delete(key);
      }
    }
  }
}

export function checkRateLimit(
  identifier: string,
  action = "global",
  maxRequests = MAX_REQUESTS,
  windowMs = WINDOW_MS
): {
  allowed: boolean;
  retryAfterSeconds?: number;
} {
  const now = Date.now();
  cleanupExpiredBuckets(now);

  const key = `${action}:${identifier}`;
  const bucket = buckets.get(key);

  if (!bucket || now - bucket.windowStart > windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    return { allowed: true };
  }

  if (bucket.count >= maxRequests) {
    const retryAfterSeconds = Math.ceil((windowMs - (now - bucket.windowStart)) / 1000);
    return { allowed: false, retryAfterSeconds };
  }

  bucket.count += 1;
  return { allowed: true };
}
