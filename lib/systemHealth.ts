import { createClient } from "@/lib/supabase/server";
import { memoizeFor, timed } from "@/lib/perf";

export type HealthStatus = "Operational" | "Degraded" | "Down" | "Not configured";
/** detail = what we saw; hint = what to do about it. Both are shown when the card is expanded. */
export type HealthCheck = { status: HealthStatus; checkedAt: string; detail?: string; hint?: string };
export type SystemHealth = { database: HealthCheck; aiProvider: HealthCheck; backgroundJobs: HealthCheck };

async function pingAiProvider(): Promise<HealthCheck> {
  const checkedAt = new Date().toISOString();
  const provider = process.env.AI_PROVIDER === "gemini" ? "gemini" : "groq";
  const apiKey = (provider === "gemini" ? process.env.LLM_API_KEY : process.env.GROQ_API_KEY)?.trim();
  if (!apiKey) {
    const name = provider === "gemini" ? "LLM_API_KEY" : "GROQ_API_KEY";
    return { status: "Not configured", checkedAt, detail: `${name} is not set on this deployment.`, hint: `Add ${name} in Vercel > Settings > Environment Variables, then redeploy.` };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2_500);
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
    const name = provider === "gemini" ? "Gemini" : "Groq";
    if (response.ok) return { status, checkedAt, detail: `${name} answered normally.` };
    return {
      status,
      checkedAt,
      detail: `${name} answered HTTP ${response.status}.`,
      hint: response.status === 401 || response.status === 403 ? "The API key was rejected. Check it in Vercel environment variables." : response.status === 429 ? "Rate limited. This clears by itself." : response.status >= 500 ? "A provider outage. Mira falls back to the other provider if one is configured." : "Unexpected response from the provider.",
    };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return { status: "Down", checkedAt, detail: timedOut ? "The provider did not answer within 2.5 seconds." : "The provider could not be reached.", hint: "Usually temporary. If it persists, check the provider's status page." };
  } finally {
    clearTimeout(timeout);
  }
}

// The provider ping is a live call to Groq/Gemini. It used to run on every analytics page view and could hold
// the page for 5 seconds; one result per minute per server instance is plenty for a status light.
const checkAiProvider = memoizeFor(60_000, pingAiProvider);

const DAY_MS = 24 * 60 * 60 * 1000;

/** Why the background jobs light is the colour it is. Pure so it can be tested. */
export function explainBackgroundJobs(input: { cronError: string | null; cronCheckedAt: string | null; now: number; cronSecretSet: boolean }): HealthCheck {
  const checkedAt = new Date(input.now).toISOString();
  if (input.cronError) {
    return { status: "Down", checkedAt, detail: `Couldn't read the job heartbeat: ${input.cronError}`, hint: "This is a database read problem, not necessarily a job problem. See the Database check." };
  }
  if (!input.cronCheckedAt) {
    return {
      status: "Down",
      checkedAt,
      detail: "The daily nudges job has never finished successfully: no heartbeat has ever been recorded.",
      hint: input.cronSecretSet
        ? "Check Vercel > your project > Settings > Cron Jobs (cron jobs only run on Production deployments) and the function logs for /api/cron/nudges. The same cleanup job (data retention) runs on the same schedule."
        : "CRON_SECRET is not set on this deployment, so every scheduled call is rejected with 403. Add CRON_SECRET in Vercel > Settings > Environment Variables (Production), then redeploy. This also stops the daily cleanup job that purges old message data.",
    };
  }
  const age = input.now - new Date(input.cronCheckedAt).getTime();
  const hours = Math.round(age / 3_600_000);
  if (age > 2 * DAY_MS) {
    return { status: "Degraded", checkedAt: input.cronCheckedAt, detail: `The last successful run was ${hours} hours ago. It should run once a day (09:00 UTC).`, hint: "Check the Vercel function logs for /api/cron/nudges to see why recent runs failed." };
  }
  return { status: "Operational", checkedAt: input.cronCheckedAt, detail: `Last successful run ${hours < 1 ? "less than an hour" : `${hours} hour${hours === 1 ? "" : "s"}`} ago. It runs once a day (09:00 UTC).` };
}

export async function getSystemHealth(): Promise<SystemHealth> {
  const checkedAt = new Date().toISOString();
  const supabase = await createClient();
  const [{ error: databaseError }, { data: cronCheck, error: cronError }] = await Promise.all([
    supabase.from("businesses").select("id", { head: true, count: "exact" }),
    supabase.from("system_health_checks").select("checked_at").eq("check_name", "nudges-cron").maybeSingle(),
  ]);
  return {
    database: databaseError
      ? { status: "Down", checkedAt, detail: `The database query failed: ${databaseError.message}`, hint: "Check the Supabase project status. If you are not a platform admin, row-level security can also block this read." }
      : { status: "Operational", checkedAt, detail: "The database answered normally." },
    aiProvider: await timed("health:ai-provider", checkAiProvider()),
    backgroundJobs: explainBackgroundJobs({ cronError: cronError?.message ?? null, cronCheckedAt: cronCheck?.checked_at ?? null, now: Date.now(), cronSecretSet: Boolean(process.env.CRON_SECRET) }),
  };
}
