import { setupChecklist } from "./setupChecklist";
let failures = 0;
function check(label: string, pass: boolean) { if (!pass) { failures++; console.error(`FAIL: ${label}`); } else console.log(`ok: ${label}`); }
const by = (env: Record<string, string>, name: string) => setupChecklist(env).find((i) => i.name === name)!;

check("an empty environment fails everything", setupChecklist({}).every((i) => !i.ok));
check("CRON_SECRET set passes", by({ CRON_SECRET: "x" }, "CRON_SECRET").ok);
check("whitespace-only does not count as set", !by({ CRON_SECRET: "   " }, "CRON_SECRET").ok);
check("either AI key is enough", by({ GROQ_API_KEY: "k" }, "GROQ_API_KEY or LLM_API_KEY").ok && by({ LLM_API_KEY: "k" }, "GROQ_API_KEY or LLM_API_KEY").ok);
check("a Paystack test key is flagged", !by({ PAYSTACK_SECRET_KEY: "sk_test_abc" }, "PAYSTACK_SECRET_KEY").ok && by({ PAYSTACK_SECRET_KEY: "sk_test_abc" }, "PAYSTACK_SECRET_KEY").note.includes("TEST"));
check("a Paystack live key passes", by({ PAYSTACK_SECRET_KEY: "sk_live_abc" }, "PAYSTACK_SECRET_KEY").ok);
check("no item ever echoes a secret value", !JSON.stringify(setupChecklist({ CRON_SECRET: "supersecretvalue" })).includes("supersecretvalue"));
if (failures) { console.error(`${failures} check(s) failed`); process.exit(1); }
