import * as whatsapp from "../whatsapp/inboundQueue";
import * as email from "../email/inboundQueue";
import { replyKeyFor } from "./inboundKey";

function check(condition: boolean, message: string): void {
  console.log(`${condition ? "PASS" : "FAIL"} - ${message}`);
  if (!condition) process.exitCode = 1;
}

type RpcCall = { fn: string; args: Record<string, unknown> };

// Minimal stand-in for the Supabase client: the claim is a single RPC now, so
// this records the call and returns whatever the database "decided".
function fakeClient(result: { data: unknown; error: unknown }) {
  const calls: RpcCall[] = [];
  const client = {
    rpc(fn: string, args: Record<string, unknown>) {
      calls.push({ fn, args });
      return Promise.resolve(result);
    },
  };
  return { client: client as never, calls };
}

async function run() {
  for (const [name, mod, fn] of [
    ["whatsapp", whatsapp, "claim_whatsapp_inbound"],
    ["email", email, "claim_email_inbound"],
  ] as const) {
    const capped = fakeClient({ data: true, error: null });
    const refused = await mod.claimInboundMessage(capped.client, { id: "r", attempts: mod.MAX_INBOUND_ATTEMPTS });
    check(refused === false && capped.calls.length === 0, `${name}: a row at the attempt cap (per the caller's read) never touches the DB`);

    const won = fakeClient({ data: true, error: null });
    const claimed = await mod.claimInboundMessage(won.client, { id: "r", attempts: 2 });
    check(claimed === true && won.calls.length === 1 && won.calls[0]?.fn === fn, `${name}: a claim is a single atomic RPC (${fn})`);
    check(
      won.calls[0]?.args.p_id === "r" && won.calls[0]?.args.p_max_attempts === mod.MAX_INBOUND_ATTEMPTS && !("attempts" in (won.calls[0]?.args ?? {})),
      `${name}: the RPC gets the cap, and the caller never supplies an attempts value`,
    );

    // The regression this fixes: the caller's read says 0 attempts, but the
    // database knows the row is already at the cap. The RPC refuses.
    const staleRead = fakeClient({ data: false, error: null });
    check(
      (await mod.claimInboundMessage(staleRead.client, { id: "r", attempts: 0 })) === false && staleRead.calls.length === 1,
      `${name}: a stale read can't get past the cap; the DB-side check decides`,
    );

    const lost = fakeClient({ data: false, error: null });
    check((await mod.claimInboundMessage(lost.client, { id: "r", attempts: 0 })) === false, `${name}: losing the claim race returns false`);

    const broken = fakeClient({ data: null, error: new Error("boom") });
    let threw = false;
    try {
      await mod.claimInboundMessage(broken.client, { id: "r", attempts: 0 });
    } catch {
      threw = true;
    }
    check(threw, `${name}: an RPC error is thrown, not treated as a lost race`);
  }

  check(replyKeyFor("wa:abc") === "reply:wa:abc", "reply key is derived from the inbound key");
  check(replyKeyFor("wa:abc") !== "wa:abc", "reply key never collides with the customer message key");
}

void run();
