import { sweepUnrepliedWhatsApp } from "./sweepUnreplied";
import { buildWhatsappItem } from "../queue/rowPayload";
import { MAX_INBOUND_ATTEMPTS } from "./inboundQueue";

function check(condition: boolean, message: string): void {
  console.log(`${condition ? "PASS" : "FAIL"} - ${message}`);
  if (!condition) process.exitCode = 1;
}

type Row = { id: string; message_id: string; waba_phone_number_id: string; payload: unknown; status: string; attempts: number; reply_text: string | null; reply_sent_at: string | null; send_started_at: string | null; send_resent: boolean };
const row = (id: string, from: string | null, extra: Partial<Row> = {}): Row => ({
  id,
  message_id: `wamid.${id}`,
  waba_phone_number_id: `phone-${id}`,
  payload: from === null ? { garbled: true } : { from, text: { body: `hello from ${id}` } },
  status: "pending",
  attempts: 1,
  reply_text: null,
  reply_sent_at: null,
  send_started_at: null,
  send_resent: false,
  ...extra,
});

// Stand-in for the Supabase client: records filters on the select, returns the given rows,
// answers the claim RPC per row, and records updates.
function fakeClient(rows: Row[], claimable: Set<string>) {
  const filters: string[] = [];
  const updates: { id: string; patch: Record<string, unknown> }[] = [];
  const claims: string[] = [];
  const query = (result: unknown) => {
    const q: Record<string, unknown> = {};
    for (const name of ["select", "in", "lt", "lte", "gte", "eq", "order", "limit"]) {
      q[name] = (...args: unknown[]) => {
        filters.push(`${name}:${JSON.stringify(args)}`);
        return q;
      };
    }
    q.then = (resolve: (value: unknown) => void) => resolve(result);
    return q;
  };
  const client = {
    from() {
      return {
        select: (...args: unknown[]) => {
          filters.push(`select:${JSON.stringify(args)}`);
          return query({ data: rows, error: null });
        },
        update: (patch: Record<string, unknown>) => ({
          eq: (_column: string, id: string) => {
            updates.push({ id, patch });
            return Promise.resolve({ error: null });
          },
        }),
      };
    },
    rpc(_fn: string, args: { p_id: string }) {
      claims.push(args.p_id);
      return Promise.resolve({ data: claimable.has(args.p_id), error: null });
    },
  };
  return { client: client as never, filters, updates, claims };
}

async function run() {
  // --- Rebuilding a message from what the webhook stored
  const item = buildWhatsappItem(row("a", "2348012345678"));
  check(item?.from === "2348012345678" && item?.text === "hello from a" && item?.phoneId === "phone-a" && item?.id === "wamid.a", "a stored message is rebuilt with sender, text, number and message id");
  check(buildWhatsappItem(row("b", null)) === null, "a stored message with no sender is reported as unreadable, not guessed at");

  // --- Scope and selection: whole queue, only retryable rows, oldest first, never rows at the attempt cap
  {
    const f = fakeClient([], new Set());
    await sweepUnrepliedWhatsApp(f.client, { limit: 7 });
    const joined = f.filters.join(" | ");
    check(!joined.includes("business_id") && !joined.includes('"eq"'), "the sweep is not limited to one business or one conversation: it scans the whole queue");
    check(joined.includes(`lt:["attempts",${MAX_INBOUND_ATTEMPTS}]`), "rows that used every attempt are never retried");
    check(joined.includes('"pending","failed","processing"'), "pending, failed and half-processed rows are all considered");
    check(joined.includes('order:["created_at",{"ascending":true}]') && joined.includes("limit:[7]"), "oldest messages first, and a cap per run");
  }

  // --- Each message is handled on its own
  {
    const processed: string[] = [];
    const f = fakeClient([row("1", "111"), row("2", "222"), row("3", "333"), row("4", "444", { payload: {} })], new Set(["1", "3"]));
    const result = await sweepUnrepliedWhatsApp(f.client, {
      process: async (_c, queued) => {
        processed.push(queued.id);
        if (queued.id === "1") throw new Error("boom");
      },
    });
    check(JSON.stringify(f.claims) === JSON.stringify(["1", "2", "3"]), "every readable message goes through the atomic claim");
    check(JSON.stringify(processed) === JSON.stringify(["1", "3"]), "only messages it actually claimed are processed (2 was held by someone else)");
    check(result.found === 4 && result.skipped === 1 && result.recovered === 1 && result.failed === 1 && result.unreadable === 1, "one failure does not stop the others; results are counted per message");
    check(f.updates.length === 1 && f.updates[0]?.id === "4" && f.updates[0]?.patch.status === "done", "an unreadable message is closed so it isn't picked up forever");
  }

  // --- Time budget
  {
    const processed: string[] = [];
    const f = fakeClient([row("1", "111"), row("2", "222")], new Set(["1", "2"]));
    await sweepUnrepliedWhatsApp(f.client, {
      budgetMs: -1,
      process: async (_c, queued) => {
        processed.push(queued.id);
      },
    });
    check(processed.length === 0, "an exhausted time budget stops the sweep before starting more work");
  }
}

void run();
