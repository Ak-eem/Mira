import { readFileSync } from "node:fs";

// Static checks for the preview's safety contract -- run with
// `npx tsx lib/ai/previewReplay.test.ts`. They read the source on purpose: the
// guarantee is "this code CANNOT write, send or record", and the cheapest
// reliable way to keep that true is to fail the build if it ever could.

function check(label: string, pass: boolean) {
  console.log(`${pass ? "PASS" : "FAIL"} — ${label}`);
  if (!pass) process.exitCode = 1;
}

const FILES = ["lib/ai/previewReplay.ts", "lib/ai/promptPreviewApi.ts", "app/api/portal/businesses/[businessId]/prompt-preview/route.ts", "app/api/admin/businesses/[businessId]/prompt-preview/route.ts"];

const FORBIDDEN_IMPORTS = [
  "@/lib/whatsapp/",
  "@/lib/email/",
  "@/lib/notifications/",
  "@/lib/nudges/",
  "@/lib/chat/processMessage",
  "@/lib/chat/processIncomingMessage",
  "@/lib/chat/orderTaking",
  "@/lib/chat/closeConversation",
  "@/lib/chat/clearHandoff",
  "@/lib/orders/transition",
];
const WRITE_CALLS = [/\.insert\(/, /\.update\(/, /\.upsert\(/, /\.delete\(/, /\.rpc\(/];

for (const file of FILES) {
  const source = readFileSync(file, "utf8");
  const imports = Array.from(source.matchAll(/from\s+"([^"]+)"/g)).map((m) => m[1]);
  check(`${file} imports nothing that sends, records or changes data`, !imports.some((spec) => FORBIDDEN_IMPORTS.some((bad) => spec.startsWith(bad))));
  check(`${file} makes no Supabase write calls`, !WRITE_CALLS.some((re) => re.test(source)));
}

const replay = readFileSync("lib/ai/previewReplay.ts", "utf8");
check("previewReplay does not import the service-role client", !/supabase\/service-role/.test(replay));
check("previewReplay composes through composeReply (the shared live path)", /from "@\/lib\/ai\/composeReply"/.test(replay) && /composeReply\(/.test(replay));
check("previewReplay disables tools (no URL fetch, no order tool)", /disableTools:\s*true/.test(replay));
check("previewReplay applies the draft via promptOverride", /promptOverride:\s*draft/.test(replay));

const live = readFileSync("lib/chat/processMessage.ts", "utf8");
check("live pipeline composes through the same composeReply", /from "@\/lib\/ai\/composeReply"/.test(live) && /composeReply\(/.test(live));
check("live pipeline no longer builds prompts inline", !/buildSystemPrompt\(/.test(live) && !/buildMessages\(/.test(live));

const context = readFileSync("lib/ai/buildContext.ts", "utf8");
check("an override never reads the shared context cache", /promptOverride \? undefined : contextCache\.get/.test(context));
check("an override never writes the shared context cache", (context.match(/if \(!promptOverride\) cacheContext/g) ?? []).length === 2);

// ---- behaviour: which question each replayed reply gets, and the switched-off gate ----
import type { SupabaseClient } from "@supabase/supabase-js";
import Module from "node:module";

// lib/supabase/service-role.ts imports "server-only", which deliberately throws outside Next.js.
// Stub just that guard so the real promptPreviewApi can be loaded here (same as cancelled.test.ts).
type Loader = (request: string, ...rest: unknown[]) => unknown;
const moduleInternals = Module as unknown as { _load: Loader };
const originalLoad = moduleInternals._load;
moduleInternals._load = function (this: unknown, request: string, ...rest: unknown[]) {
  return request === "server-only" ? {} : originalLoad.call(this, request, ...rest);
};

type Row = Record<string, unknown>;

// A tiny in-memory stand-in for the Supabase query builder. It honours eq / in / gte / lt / order /
// limit the way the database does, including cutting a result off at .limit(n), which is exactly
// what made the old bulk fetch drop the newest messages.
function fakeSupabase(tables: Record<string, Row[]>): SupabaseClient {
  return {
    from(table: string) {
      let rows = [...(tables[table] ?? [])];
      let cap: number | undefined;
      const q: Record<string, unknown> = {
        select: () => q,
        eq: (col: string, v: unknown) => { rows = rows.filter((r) => r[col] === v); return q; },
        in: (col: string, vs: unknown[]) => { rows = rows.filter((r) => vs.includes(r[col])); return q; },
        gte: (col: string, v: string) => { rows = rows.filter((r) => (r[col] as string) >= v); return q; },
        lt: (col: string, v: string) => { rows = rows.filter((r) => (r[col] as string) < v); return q; },
        order: (col: string, opts?: { ascending?: boolean }) => {
          const dir = opts?.ascending === false ? -1 : 1;
          rows.sort((a, b) => ((a[col] as string) < (b[col] as string) ? -dir : (a[col] as string) > (b[col] as string) ? dir : 0));
          return q;
        },
        limit: (n: number) => { cap = n; return q; },
        maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
        then: (resolve: (v: unknown) => unknown) => resolve({ data: cap === undefined ? rows : rows.slice(0, cap), error: null }),
      };
      return q;
    },
  } as unknown as SupabaseClient;
}

const BASE = Date.now() - 2 * 24 * 60 * 60 * 1000;
const at = (offsetSeconds: number) => new Date(BASE + offsetSeconds * 1000).toISOString();
const BUSINESS = "b1";

async function behaviourChecks() {
  const { selectPreviewTurns } = await import("./previewReplay");
  const { runPreviewTurn } = await import("./promptPreviewApi");
  type Deps = NonNullable<Parameters<typeof runPreviewTurn>[3]>;

  // --- one very busy conversation: 1600 customer messages, three replies ---
  const customer: Row[] = Array.from({ length: 1600 }, (_, i) => ({
    business_id: BUSINESS, conversation_id: "busy", role: "customer", created_at: at(i * 10 + 1), content: `Do you have size 42 in stock, ref ${i + 1}?`,
  }));
  const reply = (id: string, conversation: string, t: number): Row => ({ id, business_id: BUSINESS, conversation_id: conversation, role: "assistant", created_at: at(t), context_snapshot: {} });
  const busy = fakeSupabase({
    messages: [...customer, reply("newest", "busy", 1600 * 10 + 5), reply("middle", "busy", 699 * 10 + 5), reply("oldest", "busy", 99 * 10 + 5)],
    message_assessments: [],
    message_feedback: [],
  });
  const busyTurns = await selectPreviewTurns(busy, BUSINESS);
  const byId = new Map(busyTurns.map((t) => [t.assistantMessageId, t]));
  check("busy business: the newest reply is paired with the customer message right before it", byId.get("newest")?.question === "Do you have size 42 in stock, ref 1600?");
  check("busy business: an older reply is paired with ITS OWN preceding message", byId.get("middle")?.question === "Do you have size 42 in stock, ref 700?");
  check("at most two replies are taken from one conversation (the oldest is left out)", busyTurns.length === 2 && !byId.has("oldest"));

  // --- many conversations, more than 1500 customer messages in total ---
  const messages: Row[] = [];
  const lastQuestion = new Map<string, string>();
  for (let c = 0; c < 20; c += 1) {
    const conversation = `conv${c}`;
    for (let i = 0; i < 100; i += 1) {
      const content = `Is the blue bag still available, ${conversation} message ${i}?`;
      messages.push({ business_id: BUSINESS, conversation_id: conversation, role: "customer", created_at: at(c * 2000 + i * 10 + 1), content });
      if (i === 99) lastQuestion.set(conversation, content);
    }
    messages.push(reply(`reply-${conversation}`, conversation, c * 2000 + 1005));
  }
  const many = await selectPreviewTurns(fakeSupabase({ messages, message_assessments: [], message_feedback: [] }), BUSINESS);
  check("2000 customer messages across 20 chats: still returns a full set of 12 turns", many.length === 12);
  check("every one of them carries its own conversation's last question", many.every((t) => t.question === lastQuestion.get(t.conversationId)));
  check("with nothing flagged, the newest conversations are the ones picked", many[0].conversationId === "conv19" && many[11].conversationId === "conv8");

  // --- a thumbs-down still jumps the queue ---
  const flagged = await selectPreviewTurns(
    fakeSupabase({ messages, message_assessments: [], message_feedback: [{ message_id: "reply-conv0", rating: "down" }] }),
    BUSINESS,
  );
  check("a thumbs-down reply from the oldest chat is still picked first", flagged[0].assistantMessageId === "reply-conv0" && flagged[0].flagged === true);
  check("and it carries the right question", flagged[0].question === lastQuestion.get("conv0"));

  // --- switched-off gate on runPreviewTurn ---
  const ids = { releaseId: "11111111-1111-4111-8111-111111111111", assistantMessageId: "22222222-2222-4222-8222-222222222222" };
  const serviceClient = { marker: "service-role" };
  const calls = { replay: 0, rateLimit: 0, off: [] as unknown[] };
  const exploding = { from: () => { throw new Error("the preview must not read anything for a switched-off business"); } } as unknown as SupabaseClient;
  const draftOnly = {
    from: () => ({ select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: { id: ids.releaseId, status: "draft", ai_tone: null, ai_instructions: null }, error: null }) }),
  } as unknown as SupabaseClient;
  const makeDeps = (isSwitchedOff: () => Promise<boolean>): Deps => ({
    serviceClient: (() => serviceClient) as unknown as Deps["serviceClient"],
    rateLimit: (async () => { calls.rateLimit += 1; return { allowed: true }; }) as Deps["rateLimit"],
    isSwitchedOff: (async (client: unknown) => { calls.off.push(client); return isSwitchedOff(); }) as Deps["isSwitchedOff"],
    replay: (async () => { calls.replay += 1; return { skipped: "test" }; }) as Deps["replay"],
  });

  const off = await runPreviewTurn(exploding, BUSINESS, ids, makeDeps(async () => true));
  const offBody = (await off.json()) as { error: string; switchedOff?: boolean };
  check("switched-off business: refused with a clear 402, not a 500", off.status === 402 && offBody.switchedOff === true && /switched off/i.test(offBody.error));
  check("switched-off business: no AI replay, no rate-limit budget used, nothing read", calls.replay === 0 && calls.rateLimit === 0);
  check("the switched-off check runs on the service-role client", calls.off[0] === serviceClient);

  calls.replay = 0; calls.rateLimit = 0;
  const quiet = console.error;
  console.error = () => {};
  const unknown = await runPreviewTurn(exploding, BUSINESS, ids, makeDeps(async () => { throw new Error("db down"); }));
  console.error = quiet;
  check("status check failing: 503 try-again (not a 500), and no AI replay", unknown.status === 503 && calls.replay === 0);

  const bad = await runPreviewTurn(exploding, BUSINESS, { releaseId: "nope" }, makeDeps(async () => true));
  check("bad input is still a 400 (validated before anything else)", bad.status === 400);

  const on = await runPreviewTurn(draftOnly, BUSINESS, ids, makeDeps(async () => false));
  check("a business that is switched on still previews normally", on.status === 200 && calls.replay === 1 && calls.rateLimit === 1);
}

for (const route of ["app/api/admin/businesses/[businessId]/prompt-preview/route.ts", "app/api/portal/businesses/[businessId]/prompt-preview/route.ts"]) {
  const duration = /export const maxDuration = (\d+);/.exec(readFileSync(route, "utf8"));
  check(`${route.split("/")[2]} preview route states a duration long enough for two parallel AI calls`, Boolean(duration) && Number(duration![1]) >= 45);
}

check("promptPreviewApi uses the shared isBusinessSwitchedOff gate", /from "@\/lib\/chat\/businessStatus"/.test(readFileSync("lib/ai/promptPreviewApi.ts", "utf8")) && /isBusinessSwitchedOff/.test(readFileSync("lib/ai/promptPreviewApi.ts", "utf8")));

behaviourChecks().catch((error) => {
  console.error("FAIL — behaviour checks crashed:", error);
  process.exitCode = 1;
});
