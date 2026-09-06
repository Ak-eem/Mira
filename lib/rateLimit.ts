import { createServiceRoleClient } from "@/lib/supabase/service-role";
type Client = ReturnType<typeof createServiceRoleClient>;
export const CHAT_RATE_LIMIT_PER_MINUTE = 20;
export const FEEDBACK_RATE_LIMIT_PER_MINUTE = 30;
export type RateLimitResult = { allowed: boolean; retryAfterSeconds?: number; error?: string };
/** Atomic Postgres fixed-window limiter; safe across serverless instances and restarts. */
export async function checkRateLimit(client: Client, key: string, limit: number, windowSeconds = 60): Promise<RateLimitResult> {
  const { data, error } = await client.rpc("consume_rate_limit", { p_key: key, p_limit: limit, p_window_seconds: windowSeconds });
  if (error) { console.error("Durable rate-limit check failed:", error); return { allowed: false, retryAfterSeconds: 5, error: "unavailable" }; }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row.allowed !== "boolean") return { allowed: false, retryAfterSeconds: 5, error: "invalid_response" };
  return { allowed: row.allowed, retryAfterSeconds: typeof row.retry_after_seconds === "number" ? row.retry_after_seconds : undefined };
}
export function getRequestIp(request: Request): string {
  return ((request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip")?.trim() || "unknown")).slice(0, 255);
}
