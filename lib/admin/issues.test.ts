import { groupAiFailures, sortIssues, stuckToIssues } from "./issues";
let failures = 0;
function check(label: string, pass: boolean) { if (!pass) { failures++; console.error(`FAIL: ${label}`); } else console.log(`ok: ${label}`); }

const rows = [
  { provider: "groq", error_code: "rate_limited", created_at: "2026-10-10T10:00:00Z" },
  { provider: "groq", error_code: "rate_limited", created_at: "2026-10-10T11:00:00Z" },
  { provider: "groq", error_code: null, created_at: "2026-10-10T09:00:00Z" },
  { provider: "gemini", error_code: "timeout", created_at: "2026-10-10T08:00:00Z" },
];
const grouped = groupAiFailures(rows);
check("identical failures collapse into one issue per provider+code", grouped.length === 3);
const rl = grouped.find((i) => i.id === "ai:groq:rate_limited");
check("the count and the latest time are kept", rl?.detail.startsWith("2 failures") === true && rl.when === "2026-10-10T11:00:00Z");
check("a missing error code is labelled", grouped.some((i) => i.id === "ai:groq:unknown error"));
check("a single failure is a warning, five or more an error", rl?.severity === "warn" && groupAiFailures(Array.from({ length: 5 }, () => rows[0]))[0].severity === "error");
check("singular wording for one failure", grouped.find((i) => i.id === "ai:gemini:timeout")?.detail.startsWith("1 failure ") === true);

const now = new Date("2026-10-10T12:00:00Z");
const msgs = stuckToIssues([{ channel: "WhatsApp", id: "abc", status: "failed", attempts: 5, ageMinutes: 30, lastError: "WhatsApp rejected the reply." }], now);
check("a stuck message links to the queue and is an error", msgs[0].href === "/admin/queue" && msgs[0].severity === "error" && msgs[0].detail.includes("rejected"));
check("its time is derived from its age", msgs[0].when === "2026-10-10T11:30:00.000Z");
const sorted = sortIssues([...grouped, ...msgs]);
check("errors sort before warnings", sorted[0].severity === "error" && sorted[sorted.length - 1].severity === "warn");
check("newest first within the same severity", (() => { const w = sorted.filter((i) => i.severity === "warn"); return w.every((x, i) => i === 0 || w[i - 1].when >= x.when); })());
if (failures) { console.error(`${failures} check(s) failed`); process.exit(1); }
