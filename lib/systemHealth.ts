import { createClient } from "@/lib/supabase/server";

export type HealthStatus = "Operational" | "Degraded" | "Down" | "Not configured";
export type HealthCheck = { status: HealthStatus; checkedAt: string };
export type SystemHealth = { database: HealthCheck; aiProvider: HealthCheck; backgroundJobs: HealthCheck };

async function checkAiProvider(checkedAt: string): Promise<HealthCheck> {
  const provider = process.env.AI_PROVIDER === "gemini" ? "gemini" : "groq";
  const apiKey = (provider === "gemini" ? process.env.LLM_API_KEY : process.env.GROQ_API_KEY)?.trim();
  if (!apiKey) return { status: "Not configured", checkedAt };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const url = provider === "gemini"
      ? `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`
      : "https://api.groq.com/openai/v1/models";
    const response = await fetch(url, {
      headers: provider === "groq" ? { Authorization: `Bearer ${apiKey}` } : undefined,
      signal: controller.signal,
      cache: "no-store",
    });
    const status: HealthStatus = response.ok ? "Operational" : response.status >= 500 || response.status === 429 ? "Degraded" : "Down";
    return { status, checkedAt };
  } catch {
    return { status: "Down", checkedAt };
  } finally {
    clearTimeout(timeout);
  }
}

export async function getSystemHealth(): Promise<SystemHealth> {
  const checkedAt = new Date().toISOString();
  const supabase = await createClient();
  const [{ error: databaseError }, { data: cronCheck, error: cronError }] = await Promise.all([
    supabase.from("businesses").select("id", { head: true, count: "exact" }),
    supabase.from("system_health_checks").select("checked_at").eq("check_name", "nudges-cron").maybeSingle(),
  ]);
  const cronCheckedAt = cronCheck?.checked_at ?? null;
  const cronAge = cronCheckedAt ? Date.now() - new Date(cronCheckedAt).getTime() : Number.POSITIVE_INFINITY;
  return {
    database: { status: databaseError ? "Down" : "Operational", checkedAt },
    aiProvider: await checkAiProvider(checkedAt),
    backgroundJobs: {
      status: cronError || !cronCheckedAt ? "Down" : cronAge > 48 * 60 * 60 * 1000 ? "Degraded" : "Operational",
      checkedAt: cronCheckedAt ?? checkedAt,
    },
  };
}