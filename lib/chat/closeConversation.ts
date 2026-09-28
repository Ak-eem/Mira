import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The one place a conversation is closed on purpose. Uses the same
 * status = 'closed' value the idle-timeout close in processMessage already
 * writes, and clears the same claim / handoff state every explicit close
 * (operator End, customer End, order delivered) needs cleared.
 *
 * Only an OPEN conversation is touched, so a double call is a harmless no-op.
 */
export async function closeConversation(
  supabase: SupabaseClient,
  args: { conversationId: string; businessId: string; endedBy: "customer" | "operator" },
): Promise<{ closed: boolean; error: unknown }> {
  const { data, error } = await supabase
    .from("conversations")
    .update({
      status: "closed",
      ended_by: args.endedBy,
      claimed_by: null,
      claimed_at: null,
      needs_human: false,
      handoff_reason: null,
    })
    .eq("id", args.conversationId)
    .eq("business_id", args.businessId)
    .eq("status", "open")
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("closeConversation failed:", error);
    return { closed: false, error };
  }
  return { closed: Boolean(data), error: null };
}
