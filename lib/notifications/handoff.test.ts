import { renderHandoffEmail } from "./handoffEmail";
import { notifyOwnersOfHandoff, type HandoffDeps } from "./notifyHandoff";

let failures = 0;
function check(label: string, pass: boolean) { if (!pass) { failures++; console.error(`FAIL: ${label}`); } else console.log(`ok: ${label}`); }

// --- rendering
const mail = renderHandoffEmail({ businessName: "Ade's <Shop>", reason: "requested", link: "https://x.test/portal/b/conversations/c", waiting: 1 });
check("subject names the business and the reason", mail.subject === "Ade's <Shop>: A customer asked to speak to a person");
check("html escapes the business name and keeps the link", !mail.html.includes("<Shop>") && mail.html.includes('href="https://x.test/portal/b/conversations/c"'));
check("a single waiting conversation is not announced as many", !mail.html.includes("conversations are waiting"));
check("several waiting conversations are counted", renderHandoffEmail({ businessName: "S", reason: "order", link: "l", waiting: 4 }).html.includes("4 conversations are waiting"));
check("each reason has its own subject", new Set((["requested", "confused", "order", "email"] as const).map((r) => renderHandoffEmail({ businessName: "S", reason: r, link: "l", waiting: 1 }).subject)).size === 4);

// --- notify
function fakeClient(opts: { owners?: string[]; emails?: Record<string, string | null>; cooldown?: string; waiting?: number }) {
  const health: Record<string, string> = opts.cooldown ? { "alert:handoff:b1": opts.cooldown } : {};
  return {
    health,
    auth: { admin: { getUserById: async (id: string) => ({ data: { user: { email: opts.emails?.[id] ?? null } } }) } },
    from(table: string) {
      const q: any = {
        select: () => q, eq: (_c: string, v: string) => { q._v = v; return q; },
        maybeSingle: async () => table === "businesses" ? { data: { name: "Ade Shop" }, error: null } : { data: health[q._v] ? { checked_at: health[q._v] } : null, error: null },
        upsert: async (row: { check_name: string; checked_at: string }) => { health[row.check_name] = row.checked_at; return { error: null }; },
        then: (resolve: any) => resolve(table === "business_owners" ? { data: (opts.owners ?? []).map((user_id) => ({ user_id })), error: null } : { count: opts.waiting ?? 1, error: null }),
      };
      return q;
    },
  };
}
const NOW = new Date("2026-10-11T10:00:00Z");
const run = (client: ReturnType<typeof fakeClient>, sent: string[], fail = false) =>
  notifyOwnersOfHandoff(client as never, { businessId: "b1", conversationId: "c1", reason: "requested" }, { siteUrl: "https://app.test", now: () => NOW, send: async (to) => { if (fail) throw new Error("down"); sent.push(to); } } as HandoffDeps);

(async () => {
  { const sent: string[] = []; const c = fakeClient({ owners: ["u1", "u2"], emails: { u1: "a@x.test", u2: "b@x.test" } });
    check("every owner with an email is notified", (await run(c, sent)) === "sent" && sent.sort().join() === "a@x.test,b@x.test");
    check("a second handoff inside the window is suppressed", (await run(c, sent)) === "suppressed" && sent.length === 2); }
  { const sent: string[] = []; const old = new Date(NOW.getTime() - 11 * 60_000).toISOString();
    check("after the window it sends again", (await run(fakeClient({ owners: ["u1"], emails: { u1: "a@x.test" }, cooldown: old }), sent)) === "sent"); }
  { const sent: string[] = []; const c = fakeClient({ owners: ["u1"], emails: { u1: null } });
    check("owners without an email are skipped, nothing is sent", (await run(c, sent)) === "no_recipients" && sent.length === 0 && Object.keys(c.health).length === 0); }
  { const sent: string[] = []; const c = fakeClient({ owners: ["u1"], emails: { u1: "a@x.test" } });
    check("a failing send returns failed, never throws, and does not start the cooldown", (await run(c, sent, true)) === "failed" && Object.keys(c.health).length === 0); }
  { const sent: string[] = []; const c = fakeClient({ owners: [], emails: {} });
    check("a business with no owners is a no-op", (await run(c, sent)) === "no_recipients"); }
  if (failures) { console.error(`${failures} check(s) failed`); process.exit(1); }
})();
