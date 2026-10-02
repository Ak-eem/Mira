import type { createServiceRoleClient } from "../supabase/service-role";
import { INBOUND_QUEUE_RETENTION_DAYS } from "../retention";

type Client = ReturnType<typeof createServiceRoleClient>;

const TABLES = ["whatsapp_inbound_queue", "email_inbound_queue"] as const;
// Delete in chunks so a large backlog can't blow a serverless time limit.
// Anything left over is picked up by the next daily run.
const BATCH_SIZE = 500;
const MAX_BATCHES_PER_TABLE = 20;

export type PurgeResult = { cutoff: string; deleted: Record<(typeof TABLES)[number], number> };

// Deletes inbound-queue rows older than the retention window, whatever their
// status. A row that is still pending/failed after this long will never be
// answered, so there is nothing left to wait for.
export async function purgeInboundQueues(client: Client, now: Date = new Date()): Promise<PurgeResult> {
  const cutoff = new Date(now.getTime() - INBOUND_QUEUE_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const deleted = { whatsapp_inbound_queue: 0, email_inbound_queue: 0 };

  for (const table of TABLES) {
    for (let batch = 0; batch < MAX_BATCHES_PER_TABLE; batch += 1) {
      const { data: rows, error } = await client.from(table).select("id").lt("created_at", cutoff).limit(BATCH_SIZE);
      if (error) throw error;
      if (!rows || rows.length === 0) break;

      const { error: deleteError } = await client
        .from(table)
        .delete()
        .in(
          "id",
          rows.map((row: { id: string }) => row.id),
        );
      if (deleteError) throw deleteError;

      deleted[table] += rows.length;
      if (rows.length < BATCH_SIZE) break;
    }
  }

  return { cutoff, deleted };
}
