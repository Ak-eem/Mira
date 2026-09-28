import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Clears a conversation's handoff state -- with one exception. While an
 * AI-taken order in this conversation is still waiting for confirmation
 * (status 'placed'), the needs_human flag is the ONLY thing keeping that order
 * visible on the shared queue, so a plain "resolve" or "hand back to Mira"
 * must not silently drop it. In that case the claim is still released (if
 * asked) but the flag stays; confirming or cancelling the order releases it
 * (see lib/orders/transition.ts).
 */
export async function clearHandoff(
  supabase: SupabaseClient,
  args: { businessId: string; conversationId: string; releaseClaim: boolean },
): Promise<{ error: unknown; flagKept: boolean }> {
  const { count, error: countError } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("business_id", args.businessId)
    .eq("conversation_id", args.conversationId)
    .eq("source", "ai")
    .eq("status", "placed");
  if (countError) return { error: countError, flagKept: false };

  const flagKept = (count ?? 0) > 0;
  const patch: Record<string, unknown> = {};
  if (args.releaseClaim) {
    patch.claimed_by = null;
    patch.claimed_at = null;
  }
  if (!flagKept) {
    patch.needs_human = false;
    patch.handoff_reason = null;
  }
  if (Object.keys(patch).length === 0) return { error: null, flagKept };

  const { error } = await supabase
    .from("conversations")
    .update(patch)
    .eq("id", args.conversationId)
    .eq("business_id", args.businessId);
  return { error, flagKept };
}
