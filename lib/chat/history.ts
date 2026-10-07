import type { SupabaseClient } from "@supabase/supabase-js";

// How much conversation the model sees. One definition, used by the live
// pipeline (and by the prompt-preview replay once that ships).
export const HISTORY_MESSAGE_LIMIT = 20;

export type HistoryRow = { role: string; content: string; inbound_key: string | null };

/**
 * The most recent HISTORY_MESSAGE_LIMIT messages of a conversation, oldest
 * first (the order a model reads them in).
 *
 * This used to take the FIRST 20 messages (ascending order + limit), so in any
 * conversation longer than 20 messages the model never saw the latest turns --
 * it forgot what had just been said, and the "last two replies" checks (repeat
 * fallback, handoff) looked at old replies instead of the newest ones. We now
 * query newest-first with the limit, then put the rows back in chronological
 * order.
 *
 * `before` (an ISO timestamp) rebuilds what the model saw at the time of a
 * past message instead of at "now".
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

  const { data, error } = await query.order("created_at", { ascending: false }).limit(HISTORY_MESSAGE_LIMIT);
  if (error || !data) return { data: null, error };

  return { data: (data as HistoryRow[]).slice().reverse(), error: null };
}
