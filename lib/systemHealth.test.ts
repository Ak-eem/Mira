import { explainBackgroundJobs } from "./systemHealth";
let failures = 0;
function check(label: string, pass: boolean) { if (!pass) { failures++; console.error(`FAIL: ${label}`); } else console.log(`ok: ${label}`); }
const NOW = Date.parse("2026-10-11T03:00:00Z");
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

const never = explainBackgroundJobs({ cronError: null, cronCheckedAt: null, now: NOW, cronSecretSet: true });
check("no heartbeat is Down and says it never finished", never.status === "Down" && never.detail?.includes("never finished") === true);
check("with CRON_SECRET set, the hint points at Vercel cron settings", never.hint?.includes("Cron Jobs") === true);
const noSecret = explainBackgroundJobs({ cronError: null, cronCheckedAt: null, now: NOW, cronSecretSet: false });
check("without CRON_SECRET, the hint names it and the 403", noSecret.hint?.includes("CRON_SECRET is not set") === true && noSecret.hint.includes("403"));
check("a read error is reported as a read problem", explainBackgroundJobs({ cronError: "permission denied", cronCheckedAt: null, now: NOW, cronSecretSet: true }).detail?.includes("permission denied") === true);
const fresh = explainBackgroundJobs({ cronError: null, cronCheckedAt: hoursAgo(5), now: NOW, cronSecretSet: true });
check("a recent heartbeat is Operational with its age", fresh.status === "Operational" && fresh.detail?.includes("5 hours") === true);
check("48h+ old is Degraded", explainBackgroundJobs({ cronError: null, cronCheckedAt: hoursAgo(60), now: NOW, cronSecretSet: true }).status === "Degraded");
check("exactly under 48h is still Operational", explainBackgroundJobs({ cronError: null, cronCheckedAt: hoursAgo(47), now: NOW, cronSecretSet: true }).status === "Operational");
if (failures) { console.error(`${failures} check(s) failed`); process.exit(1); }
