import { purgeInboundQueues } from "./purgeInboundQueues";
import { INBOUND_QUEUE_RETENTION_DAYS } from "../retention";

function check(condition: boolean, message: string): void {
  console.log(`${condition ? "PASS" : "FAIL"} - ${message}`);
  if (!condition) process.exitCode = 1;
}

type Row = { id: string; created_at: string };

// In-memory stand-in for the two queue tables. Supports exactly the calls the
// purge makes: select("id").lt("created_at", x).limit(n) and delete().in("id", ids).
function fakeDb(tables: Record<string, Row[]>, failOn?: string) {
  const log: string[] = [];
  const client = {
    from(table: string) {
      return {
        select() {
          let cutoff = "";
          const q = {
            lt(_col: string, value: string) {
              cutoff = value;
              return q;
            },
            limit(n: number) {
              if (failOn === table) return Promise.resolve({ data: null, error: new Error("boom") });
              const rows = tables[table].filter((r) => r.created_at < cutoff).slice(0, n);
              return Promise.resolve({ data: rows.map((r) => ({ id: r.id })), error: null });
            },
          };
          return q;
        },
        delete() {
          return {
            in(_col: string, ids: string[]) {
              log.push(`${table}:${ids.length}`);
              tables[table] = tables[table].filter((r) => !ids.includes(r.id));
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  };
  return { client: client as never, log };
}

const DAY = 24 * 60 * 60 * 1000;
const now = new Date("2026-10-02T12:00:00.000Z");
const iso = (daysAgo: number) => new Date(now.getTime() - daysAgo * DAY).toISOString();

async function run() {
  check(INBOUND_QUEUE_RETENTION_DAYS === 30, "retention is 30 days");

  const tables = {
    whatsapp_inbound_queue: [
      { id: "w-old", created_at: iso(31) },
      { id: "w-edge-old", created_at: iso(30.01) },
      { id: "w-edge-new", created_at: iso(29.99) },
      { id: "w-new", created_at: iso(1) },
    ],
    email_inbound_queue: [
      { id: "e-old", created_at: iso(90) },
      { id: "e-new", created_at: iso(0) },
    ],
  };
  const { client } = fakeDb(tables);
  const result = await purgeInboundQueues(client, now);

  check(result.cutoff === iso(30), "cutoff is exactly 30 days before now");
  check(result.deleted.whatsapp_inbound_queue === 2 && result.deleted.email_inbound_queue === 1, "counts rows deleted per table");
  check(
    tables.whatsapp_inbound_queue.map((r) => r.id).sort().join() === "w-edge-new,w-new",
    "keeps whatsapp rows inside the 30-day window",
  );
  check(tables.email_inbound_queue.map((r) => r.id).join() === "e-new", "keeps email rows inside the window");

  // Backlog bigger than one batch: drains in several chunks, still keeps recent rows.
  const big = {
    whatsapp_inbound_queue: [
      ...Array.from({ length: 1200 }, (_, i) => ({ id: `old-${i}`, created_at: iso(40) })),
      { id: "keep", created_at: iso(2) },
    ],
    email_inbound_queue: [],
  };
  const bigDb = fakeDb(big);
  const bigResult = await purgeInboundQueues(bigDb.client, now);
  check(bigResult.deleted.whatsapp_inbound_queue === 1200, "drains a large backlog across batches");
  check(big.whatsapp_inbound_queue.length === 1 && big.whatsapp_inbound_queue[0].id === "keep", "large backlog: recent row survives");
  check(bigDb.log.every((entry) => Number(entry.split(":")[1]) <= 500), "never deletes more than one batch at a time");

  // Empty tables are a no-op, not an error.
  const emptyResult = await purgeInboundQueues(fakeDb({ whatsapp_inbound_queue: [], email_inbound_queue: [] }).client, now);
  check(emptyResult.deleted.whatsapp_inbound_queue === 0 && emptyResult.deleted.email_inbound_queue === 0, "empty tables delete nothing");

  // A database error surfaces (so the cron run shows as failed) instead of being swallowed.
  let threw = false;
  try {
    await purgeInboundQueues(fakeDb({ whatsapp_inbound_queue: [], email_inbound_queue: [] }, "email_inbound_queue").client, now);
  } catch {
    threw = true;
  }
  check(threw, "a database error is thrown, not swallowed");
}

void run();
