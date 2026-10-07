import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { checkRateLimit } from "@/lib/rateLimit";
import { replayTurn, selectPreviewTurns } from "@/lib/ai/previewReplay";

// Shared by the owner endpoint (portal) and the platform-admin endpoint. Each
// caller authenticates, then hands over the signed-in user's own Supabase
// client, so every read below runs under that person's row-level security.

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RUNS_PER_HOUR = 60;
const LISTS_PER_HOUR = 30;

async function limited(key: string, limit: number): Promise<NextResponse | null> {
  const result = await checkRateLimit(createServiceRoleClient(), key, limit, 3600);
  if (result.allowed) return null;
  return NextResponse.json(
    { error: "You've run a lot of previews recently. Please try again a little later." },
    { status: result.error ? 503 : 429, headers: { "Retry-After": String(result.retryAfterSeconds ?? 60) } },
  );
}

export async function listPreviewTurns(supabase: SupabaseClient, businessId: string) {
  const blocked = await limited(`prompt-preview-list:${businessId}`, LISTS_PER_HOUR);
  if (blocked) return blocked;
  return NextResponse.json({ turns: await selectPreviewTurns(supabase, businessId) });
}

export async function runPreviewTurn(supabase: SupabaseClient, businessId: string, body: unknown) {
  const input = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  const releaseId = typeof input.releaseId === "string" ? input.releaseId : "";
  const assistantMessageId = typeof input.assistantMessageId === "string" ? input.assistantMessageId : "";
  if (!UUID_REGEX.test(releaseId) || !UUID_REGEX.test(assistantMessageId)) {
    return NextResponse.json({ error: "releaseId and assistantMessageId are required." }, { status: 400 });
  }

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

  const blocked = await limited(`prompt-preview-run:${businessId}`, RUNS_PER_HOUR);
  if (blocked) return blocked;

  const result = await replayTurn(supabase, {
    businessId,
    assistantMessageId,
    draft: { ai_tone: release.ai_tone, ai_instructions: release.ai_instructions },
  });
  return NextResponse.json(result);
}
