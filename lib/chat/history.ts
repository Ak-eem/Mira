import type { SupabaseClient } from "@supabase/supabase-js";

// How much conversation the model sees. One definition, used by the live
// pipeline and by the preview replay.
export const HISTORY_MESSAGE_LIMIT = 20;

export type HistoryRow = { role: string; content: string; inbound_key: string | null };

/**
 * The messages the model is shown before a customer's new message. `before`
 * (an ISO timestamp) lets the preview replay rebuild what the model saw at the
 * time of a past message instead of at "now".
 */
export async function loadPriorMessages(
  supabase: SupabaseClient,
  conversationId: string,
  options: { before?: string } = {},
): Promise<{ data: HistoryRow[] | null; error: unknown }> {
  let query = supabase
    .from("messages")
    .select("role, content, inbound_key")
    .eq("conversation_id", conversationId);
  if (options.before) query = query.lt("created_at", options.before);

  const { data, error } = await query.order("created_at", { ascending: true }).limit(HISTORY_MESSAGE_LIMIT);
  return { data: (data as HistoryRow[] | null) ?? null, error };
}
