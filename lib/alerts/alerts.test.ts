import { sendAlertCore, renderAlertHtml, type AlertDeps } from "./core";
import { digestFrom, findStuckRows, runAlertSweep, AI_FAILURE_MIN } from "./sweep";

let failures = 0;
function check(label: string, pass: boolean) { if (!pass) { failures++; console.error(`FAIL: ${label}`); } else console.log(`ok: ${label}`); }

// In-memory stand-in for the bits of the Supabase client the alert code uses.
function fakeClient(opts: { health?: Record<string, string>; queues?: Record<string, any[]>; telemetry?: { total: number; failed: number } } = {}) {
  const health = { ...(opts.health ?? {}) };
  const client = {
    health,
    from(table: string) {
      if (table === "system_health_checks") {
        let name = "";
        const q: any = {
          select: () => q,
          eq: (_c: string, v: string) => { name = v; return q; },
          maybeSingle: async () => ({ data: health[name] ? { checked_at: health[name] } : null, error: null }),
          upsert: async (row: { check_name: string; checked_at: string }) => { health[row.check_name] = row.checked_at; return { error: null }; },
        };
        return q;
      }
      if (table === "ai_response_telemetry") {
        let onlyFailed = false;
        const q: any = {
          select: () => q,
          gte: () => q,
          eq: (_c: string, v: boolean) => { onlyFailed = v === false; return q; },
          then: (resolve: any) => resolve({ count: onlyFailed ? opts.telemetry?.failed ?? 0 : opts.telemetry?.total ?? 0, error: null }),
        };
        return q;
      }
      const rows = opts.queues?.[table] ?? [];
      const q: any = { select: () => q, neq: () => q, lt: () => q, gt: () => q, order: () => q, limit: async () => ({ data: rows, error: null }) };
      return q;
    },
  };
  return client;
}

const NOW = new Date("2026-10-10T12:00:00Z");
function deps(sent: Array<{ to: string; subject: string; html: string }>, to: string | undefined = "ops@example.com", fail = false): AlertDeps {
  return { to, now: () => NOW, send: async (t, s, h) => { if (fail) throw new Error("resend down"); sent.push({ to: t, subject: s, html: h }); } };
}

(async () => {
  // --- sendAlertCore
  { const sent: any[] = []; const c = fakeClient();
    check("first alert is sent", (await sendAlertCore(c, { key: "k", subject: "S", lines: ["a"] }, deps(sent))) === "sent" && sent.length === 1);
    check("subject is prefixed with [Mira]", sent[0].subject === "[Mira] S");
    check("same key inside the cooldown is suppressed", (await sendAlertCore(c, { key: "k", subject: "S", lines: ["a"] }, deps(sent))) === "suppressed" && sent.length === 1);
    check("a different key is not suppressed", (await sendAlertCore(c, { key: "other", subject: "S2", lines: ["a"] }, deps(sent))) === "sent" && sent.length === 2); }
  { const sent: any[] = []; const old = new Date(NOW.getTime() - 7 * 3600_000).toISOString(); const c = fakeClient({ health: { "alert:k": old } });
    check("sends again once the cooldown has passed", (await sendAlertCore(c, { key: "k", subject: "S", lines: [] }, deps(sent))) === "sent"); }
  { const sent: any[] = []; const c = fakeClient();
    check("no recipient configured -> not_configured, nothing sent", (await sendAlertCore(c, { key: "k", subject: "S", lines: [] }, { ...deps(sent), to: undefined })) === "not_configured" && sent.length === 0); }
  { const sent: any[] = []; const c = fakeClient();
    const r = await sendAlertCore(c, { key: "k", subject: "S", lines: [] }, deps(sent, "ops@example.com", true));
    check("a failing send returns 'failed' and never throws", r === "failed");
    check("a failed send does not start the cooldown", c.health["alert:k"] === undefined); }
  check("html escapes message text", !renderAlertHtml({ key: "k", subject: "<b>x</b>", lines: ["<script>"] }).includes("<script>"));

  // --- sweep
  const stuckRow = { id: "11111111-aaaa", status: "failed", attempts: 5, created_at: new Date(NOW.getTime() - 90 * 60_000).toISOString(), last_error: "WhatsApp rejected the reply." };
  { const rows = await findStuckRows(fakeClient({ queues: { whatsapp_inbound_queue: [stuckRow], email_inbound_queue: [] } }), NOW);
    check("findStuckRows maps a row", rows.length === 1 && rows[0].channel === "WhatsApp" && rows[0].ageMinutes === 90 && rows[0].attempts === 5); }
  { const noise = { ...stuckRow, last_error: "No business is configured for this inbound address." };
    const rows = await findStuckRows(fakeClient({ queues: { whatsapp_inbound_queue: [], email_inbound_queue: [noise] } }), NOW);
    check("mail to an unknown address is not reported as stuck", rows.length === 0); }
  check("no problems -> no digest", digestFrom({ stuck: [], ai: { total: 100, failed: 1 } }) === null);
  check("a few failures below the minimum do not alert", digestFrom({ stuck: [], ai: { total: 10, failed: AI_FAILURE_MIN - 1 } }) === null);
  check("many failures but a tiny share do not alert", digestFrom({ stuck: [], ai: { total: 1000, failed: AI_FAILURE_MIN + 5 } }) === null);
  check("high failure share alerts", digestFrom({ stuck: [], ai: { total: 20, failed: 8 } })?.subject === "AI provider errors");
  { const d = digestFrom({ stuck: [{ channel: "Email", id: "abcdef123456", status: "failed", attempts: 5, ageMinutes: 30, lastError: null }], ai: { total: 0, failed: 0 } });
    check("stuck rows alert and mention the retry page", d?.subject === "1 unanswered message(s)" && d.lines[0].includes("/admin/queue")); }
  { const sent: any[] = []; const c = fakeClient({ queues: { whatsapp_inbound_queue: [stuckRow], email_inbound_queue: [] }, telemetry: { total: 0, failed: 0 } });
    const r1 = await runAlertSweep(c, deps(sent));
    const r2 = await runAlertSweep(c, deps(sent));
    check("sweep sends once, then respects the cooldown", r1.result === "sent" && r2.result === "suppressed" && sent.length === 1); }
  { const sent: any[] = []; const c = fakeClient({ queues: { whatsapp_inbound_queue: [], email_inbound_queue: [] }, telemetry: { total: 50, failed: 0 } });
    const r = await runAlertSweep(c, deps(sent));
    check("healthy system sends nothing", r.result === "nothing_to_report" && sent.length === 0); }

  if (failures > 0) { console.error(`${failures} check(s) failed`); process.exit(1); }
})();
