import { createClient } from "@/lib/supabase/server";

export type PromptRelease = {
  id: string;
  business_id: string;
  version: number;
  ai_tone: string | null;
  ai_instructions: string | null;
  status: "draft" | "published";
  note: string | null;
  created_by: string;
  created_at: string;
  published_by: string | null;
  published_at: string | null;
};

// The single draft row for this business, if one is currently being
// edited (see the partial unique index on prompt_releases -- at most one
// per business).
export async function getCurrentDraft(businessId: string): Promise<PromptRelease | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("prompt_releases")
    .select("*")
    .eq("business_id", businessId)
    .eq("status", "draft")
    .maybeSingle();
  return data;
}

// Whichever release businesses.active_prompt_release_id currently points
// to -- the same content buildContext.ts is serving on live chat right
// now (mirrored onto businesses.ai_tone/ai_instructions at publish time).
export async function getActiveRelease(businessId: string): Promise<PromptRelease | null> {
  const supabase = await createClient();
  const { data: business } = await supabase
    .from("businesses")
    .select("active_prompt_release_id")
    .eq("id", businessId)
    .maybeSingle();
  if (!business?.active_prompt_release_id) return null;

  const { data } = await supabase
    .from("prompt_releases")
    .select("*")
    .eq("id", business.active_prompt_release_id)
    .maybeSingle();
  return data;
}

// Every published release, newest first -- the version history list.
// Drafts are excluded; there's at most one and it's shown separately by
// getCurrentDraft.
export async function getPublishedHistory(businessId: string): Promise<PromptRelease[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("prompt_releases")
    .select("*")
    .eq("business_id", businessId)
    .eq("status", "published")
    .order("version", { ascending: false });
  return data ?? [];
}

// Creates the business's first draft, or updates its existing one in
// place -- upsert_prompt_draft (see supabase/migrations/0046_prompt_releases.sql)
// does the actual read-then-write atomically so two concurrent saves
// can't race into two different version numbers.
export async function saveDraft(
  businessId: string,
  aiTone: string,
  aiInstructions: string,
  note: string,
  actorEmail: string,
): Promise<{ release: PromptRelease | null; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("upsert_prompt_draft", {
    p_business_id: businessId,
    p_ai_tone: aiTone.trim() || null,
    p_ai_instructions: aiInstructions.trim() || null,
    p_note: note.trim() || null,
    p_actor_email: actorEmail,
  });
  if (error) return { release: null, error: error.message };
  return { release: data as PromptRelease, error: null };
}

// The one action behind both "Publish" and "Roll back to this version" --
// see publish_prompt_release in the migration for why they're the same
// operation. releaseId can be the current draft (first-time publish) or
// any older published release (rollback); either way this is what makes
// it the active one for the business, mirroring its content onto
// businesses.ai_tone/ai_instructions in the same transaction.
export async function publishRelease(
  businessId: string,
  releaseId: string,
  actorEmail: string,
): Promise<{ release: PromptRelease | null; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("publish_prompt_release", {
    p_business_id: businessId,
    p_release_id: releaseId,
    p_actor_email: actorEmail,
  });
  if (error) return { release: null, error: error.message };
  return { release: data as PromptRelease, error: null };
}
