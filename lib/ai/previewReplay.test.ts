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
