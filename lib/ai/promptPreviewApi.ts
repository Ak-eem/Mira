import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { checkRateLimit } from "@/lib/rateLimit";
import { isBusinessSwitchedOff } from "@/lib/chat/businessStatus";
import { replayTurn, selectPreviewTurns } from "@/lib/ai/previewReplay";

// Shared by the owner endpoint (portal) and the platform-admin endpoint. Each
// caller authenticates, then hands over the signed-in user's own Supabase
// client, so every read below runs under that person's row-level security.

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RUNS_PER_HOUR = 60;
const LISTS_PER_HOUR = 30;

// The pieces that touch the outside world, in one object so a test can swap them. The service-role
// client lives here (not in previewReplay.ts, which the lint rule keeps read-only and key-free).
export type PreviewDeps = {
  serviceClient: () => ReturnType<typeof createServiceRoleClient>;
  rateLimit: typeof checkRateLimit;
  isSwitchedOff: typeof isBusinessSwitchedOff;
  replay: typeof replayTurn;
};

const liveDeps: PreviewDeps = {
  serviceClient: createServiceRoleClient,
  rateLimit: checkRateLimit,
  isSwitchedOff: isBusinessSwitchedOff,
  replay: replayTurn,
};

async function limited(deps: PreviewDeps, key: string, limit: number): Promise<NextResponse | null> {
  const result = await deps.rateLimit(deps.serviceClient(), key, limit, 3600);
  if (result.allowed) return null;
  return NextResponse.json(
    { error: "You've run a lot of previews recently. Please try again a little later." },
    { status: result.error ? 503 : 429, headers: { "Retry-After": String(result.retryAfterSeconds ?? 60) } },
  );
}

// A preview calls the AI twice, so it follows the same rule as every other channel: a business that
// is switched off (cancelled, or a trial or paid period that has ended) gets no AI calls at all.
// If the status can't be read we refuse rather than guess; that is a "try again", not a 500.
async function switchedOffResponse(deps: PreviewDeps, businessId: string): Promise<NextResponse | null> {
  let switchedOff: boolean;
  try {
    switchedOff = await deps.isSwitchedOff(deps.serviceClient(), businessId);
  } catch (error) {
    console.error("Preview: could not check whether the business is switched off:", error);
    return NextResponse.json(
      { error: "We couldn't check your plan just now. Please try again in a moment." },
      { status: 503, headers: { "Retry-After": "10" } },
    );
  }
  if (!switchedOff) return null;
  return NextResponse.json(
    { error: "Your Mira assistant is switched off, so previews are paused. Renew your plan to preview prompt changes.", switchedOff: true },
    { status: 402 },
  );
}

export async function listPreviewTurns(supabase: SupabaseClient, businessId: string, deps: PreviewDeps = liveDeps) {
  const blocked = await limited(deps, `prompt-preview-list:${businessId}`, LISTS_PER_HOUR);
  if (blocked) return blocked;
  return NextResponse.json({ turns: await selectPreviewTurns(supabase, businessId) });
}

export async function runPreviewTurn(supabase: SupabaseClient, businessId: string, body: unknown, deps: PreviewDeps = liveDeps) {
  const input = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  const releaseId = typeof input.releaseId === "string" ? input.releaseId : "";
  const assistantMessageId = typeof input.assistantMessageId === "string" ? input.assistantMessageId : "";
  if (!UUID_REGEX.test(releaseId) || !UUID_REGEX.test(assistantMessageId)) {
    return NextResponse.json({ error: "releaseId and assistantMessageId are required." }, { status: 400 });
  }

  // Before any AI work: a switched-off business gets a clear message, not a model call.
  const off = await switchedOffResponse(deps, businessId);
  if (off) return off;

  // Only a saved DRAFT of this business can be previewed.
  const { data: release, error } = await supabase
    .from("prompt_releases")
    .select("id, status, ai_tone, ai_instructions")
    .eq("id", releaseId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  if (!release || release.status !== "draft") {
    return NextResponse.json({ error: "Save your draft first, then preview it." }, { status: 404 });
  }

  const blocked = await limited(deps, `prompt-preview-run:${businessId}`, RUNS_PER_HOUR);
  if (blocked) return blocked;

  const result = await deps.replay(supabase, {
    businessId,
    assistantMessageId,
    draft: { ai_tone: release.ai_tone, ai_instructions: release.ai_instructions },
  });
  return NextResponse.json(result);
}
