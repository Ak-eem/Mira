import type { SupabaseClient } from "@supabase/supabase-js";
import { HISTORY_MESSAGE_LIMIT, loadPriorMessages } from "./history";

// Run with `npx tsx lib/chat/history.test.ts`. Uses a tiny in-memory stand-in
// for the Supabase query builder so the ordering/limit behaviour is actually
// exercised, not just assumed.

function check(label: string, pass: boolean) {
  console.log(`${pass ? "PASS" : "FAIL"} — ${label}`);
  if (!pass) process.exitCode = 1;
}

type Row = { role: string; content: string; inbound_key: string | null; conversation_id: string; created_at: string };

function makeClient(rows: Row[], failWith?: unknown): SupabaseClient {
  const builder = {
    filters: [] as ((r: Row) => boolean)[],
    sort: { ascending: true },
    select() { return this; },
    eq(column: keyof Row, value: string) { this.filters.push((r) => r[column] === value); return this; },
    lt(column: keyof Row, value: string) { this.filters.push((r) => String(r[column]) < value); return this; },
    order(_column: string, options: { ascending: boolean }) { this.sort = options; return this; },
    async limit(count: number) {
      if (failWith) return { data: null, error: failWith };
      const picked = rows
        .filter((r) => this.filters.every((f) => f(r)))
        .sort((a, b) => (a.created_at < b.created_at ? -1 : 1) * (this.sort.ascending ? 1 : -1))
        .slice(0, count)
        .map(({ role, content, inbound_key }) => ({ role, content, inbound_key }));
      return { data: picked, error: null };
    },
  };
  return { from: () => builder } as unknown as SupabaseClient;
}

const at = (n: number) => `2026-10-01T10:${String(n).padStart(2, "0")}:00.000Z`;
const conversation = (count: number, id = "c1"): Row[] =>
  Array.from({ length: count }, (_, i) => ({
    role: i % 2 === 0 ? "customer" : "assistant",
    content: `m${i + 1}`,
    inbound_key: null,
    conversation_id: id,
    created_at: at(i + 1),
  }));

async function main() {
  const long = await loadPriorMessages(makeClient(conversation(30)), "c1");
  check("limit is 20", HISTORY_MESSAGE_LIMIT === 20);
  check("a 30-message chat returns exactly 20 messages", long.data?.length === 20);
  check("they are the LATEST 20 (m11..m30), not the first 20", long.data?.[0].content === "m11" && long.data?.[19].content === "m30");
  check("most recent message is last (chronological for the model)", long.data?.[19].content === "m30");
  check("returned in strictly chronological order", long.data?.every((row, i, all) => i === 0 || Number(row.content.slice(1)) > Number(all[i - 1].content.slice(1))) === true);

  const short = await loadPriorMessages(makeClient(conversation(5)), "c1");
  check("a short chat returns everything, oldest first", short.data?.map((r) => r.content).join(",") === "m1,m2,m3,m4,m5");

  const exact = await loadPriorMessages(makeClient(conversation(20)), "c1");
  check("exactly 20 messages are all kept", exact.data?.length === 20 && exact.data?.[0].content === "m1");

  const empty = await loadPriorMessages(makeClient([]), "c1");
  check("an empty conversation returns an empty list, not an error", empty.error === null && empty.data?.length === 0);

  const other = await loadPriorMessages(makeClient([...conversation(30, "c1"), ...conversation(30, "c2")]), "c2");
  check("only the requested conversation's messages are used", other.data?.length === 20);

  const before = await loadPriorMessages(makeClient(conversation(30)), "c1", { before: at(25) });
  check("`before` rebuilds history as of a past message (m5..m24)", before.data?.[0].content === "m5" && before.data?.[19].content === "m24");

  const failed = await loadPriorMessages(makeClient(conversation(3), { message: "boom" }), "c1");
  check("a query error is passed through with no data", failed.data === null && failed.error !== null);
}

void main();
