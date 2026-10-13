import type { createServiceRoleClient } from "@/lib/supabase/service-role";
import { claimInboundMessage, MAX_INBOUND_ATTEMPTS, type QueueRow } from "./inboundQueue";
import { buildWhatsappItem } from "@/lib/queue/rowPayload";

type Client = ReturnType<typeof createServiceRoleClient>;

const COLUMNS = "id,message_id,waba_phone_number_id,payload,status,attempts,reply_text,reply_sent_at,send_started_at,send_resent";
type StuckRow = QueueRow & { message_id: string; waba_phone_number_id: string; payload: unknown };

export type SweepResult = { found: number; skipped: number; recovered: number; failed: number; unreadable: number };

type Options = {
  limit?: number;
  // Leave very recent rows alone: the webhook that stored them is probably still working.
  minAgeSeconds?: number;
  budgetMs?: number;
  process?: (client: Client, row: QueueRow, item: { id: string; from: string; text: string; phoneId: string }) => Promise<void>;
};

// Finds WhatsApp messages Mira never finished answering and finishes them.
//
// Scope: it looks at the whole platform's queue in one pass (every business), but each
// message is handled on its own, inside its own customer's conversation, using the same
// claim, lock and outbox rules as the live webhook (and the admin Retry button). One stuck customer never blocks
// another, two sweeps (or a sweep and the webhook) can't process the same message twice,
// and a message that has used all its attempts is left alone and shown to the admin
// instead of being retried forever.
export async function sweepUnrepliedWhatsApp(client: Client, options: Options = {}): Promise<SweepResult> {
  const { limit = 25, minAgeSeconds = 120, budgetMs = 40_000 } = options;
  // Loaded on first use so the pure parts (and their tests) never pull in the chat pipeline.
  let process = options.process;
  const result: SweepResult = { found: 0, skipped: 0, recovered: 0, failed: 0, unreadable: 0 };
  const started = Date.now();

  const { data, error } = await client
    .from("whatsapp_inbound_queue")
    .select(COLUMNS)
    .in("status", ["pending", "failed", "processing"])
    .lt("attempts", MAX_INBOUND_ATTEMPTS)
    .lte("available_at", new Date().toISOString())
    .lte("created_at", new Date(Date.now() - minAgeSeconds * 1000).toISOString())
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw error;

  const rows = (data ?? []) as StuckRow[];
  result.found = rows.length;

  for (const row of rows) {
    if (Date.now() - started > budgetMs) break;

    const item = buildWhatsappItem(row);
    if (!item) {
      // Nothing to answer (no sender). Close it so it is not picked up forever.
      await client.from("whatsapp_inbound_queue").update({ status: "done", locked_at: null, last_error: "Unreadable stored message; closed by the unreplied-message sweep." }).eq("id", row.id);
      result.unreadable++;
      continue;
    }

    // The same atomic claim the webhook uses: if the webhook (or another sweep) holds
    // the row, this returns false and we move on.
    if (!(await claimInboundMessage(client, row))) {
      result.skipped++;
      continue;
    }
    try {
      process ??= (await import("./processQueued")).processWhatsappQueued;
      await process(client, row, item);
      result.recovered++;
    } catch (error) {
      // processWhatsappQueued has already recorded the failure on the row.
      console.error(`Unreplied-message sweep could not finish queue row ${row.id}:`, error);
      result.failed++;
    }
  }
  return result;
}

export type UnrepliedCounts = { waiting: number; gaveUp: number; oldestWaitingAt: string | null };

// For the admin dashboard. "Waiting" = still being retried; "gave up" = used every
// attempt, so the customer never got an answer and a person needs to follow up.
export async function countUnrepliedWhatsApp(client: Client, minAgeSeconds = 180): Promise<UnrepliedCounts> {
  const cutoff = new Date(Date.now() - minAgeSeconds * 1000).toISOString();
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const [waiting, oldest, gaveUp] = await Promise.all([
    client.from("whatsapp_inbound_queue").select("id", { count: "exact", head: true }).in("status", ["pending", "failed", "processing"]).lt("attempts", MAX_INBOUND_ATTEMPTS).lte("created_at", cutoff),
    client.from("whatsapp_inbound_queue").select("created_at").in("status", ["pending", "failed", "processing"]).lt("attempts", MAX_INBOUND_ATTEMPTS).lte("created_at", cutoff).order("created_at", { ascending: true }).limit(1),
    client.from("whatsapp_inbound_queue").select("id", { count: "exact", head: true }).eq("status", "failed").gte("attempts", MAX_INBOUND_ATTEMPTS).gte("created_at", since),
  ]);
  return { waiting: waiting.count ?? 0, gaveUp: gaveUp.count ?? 0, oldestWaitingAt: oldest.data?.[0]?.created_at ?? null };
}
