import * as whatsapp from "../whatsapp/inboundQueue";
import * as email from "../email/inboundQueue";
import { replyKeyFor } from "./inboundKey";

function check(condition: boolean, message: string): void {
  console.log(`${condition ? "PASS" : "FAIL"} - ${message}`);
  if (!condition) process.exitCode = 1;
}

type Call = { table: string; payload: Record<string, unknown> };

// Minimal chainable stand-in for the Supabase query builder. `winners` says
// which update attempt (1-based) actually matches a row.
function fakeClient(winners: number[]) {
  const calls: Call[] = [];
  let n = 0;
  const client = {
    from(table: string) {
      return {
        update(payload: Record<string, unknown>) {
          calls.push({ table, payload });
          const attempt = ++n;
          const chain: Record<string, unknown> = {};
          for (const m of ["eq", "in", "lte", "lt"]) chain[m] = () => chain;
          chain.select = () => Promise.resolve({ data: winners.includes(attempt) ? [{ id: "row" }] : [], error: null });
          return chain;
        },
      };
    },
  };
  return { client: client as never, calls };
}

async function run() {
  for (const [name, mod, table] of [
    ["whatsapp", whatsapp, "whatsapp_inbound_queue"],
    ["email", email, "email_inbound_queue"],
  ] as const) {
    const capped = fakeClient([1]);
    const refused = await mod.claimInboundMessage(capped.client, { id: "r", attempts: mod.MAX_INBOUND_ATTEMPTS });
    check(refused === false && capped.calls.length === 0, `${name}: a row at the attempt cap is not claimed and never touches the DB`);

    const first = fakeClient([1]);
    const claimed = await mod.claimInboundMessage(first.client, { id: "r", attempts: 2 });
    check(claimed === true && first.calls[0]?.table === table && first.calls[0]?.payload.attempts === 3, `${name}: a successful claim increments attempts`);

    const stale = fakeClient([2]);
    const reclaimed = await mod.claimInboundMessage(stale.client, { id: "r", attempts: 0 });
    check(reclaimed === true && stale.calls.length === 2 && stale.calls[1]?.payload.attempts === 1, `${name}: a stale-lock reclaim also increments attempts`);

    const lost = fakeClient([]);
    check((await mod.claimInboundMessage(lost.client, { id: "r", attempts: 0 })) === false, `${name}: losing the claim race returns false`);
  }

  check(replyKeyFor("wa:abc") === "reply:wa:abc", "reply key is derived from the inbound key");
  check(replyKeyFor("wa:abc") !== "wa:abc", "reply key never collides with the customer message key");
}

void run();
