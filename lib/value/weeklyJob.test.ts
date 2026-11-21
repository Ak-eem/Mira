import type { SupabaseClient } from "@supabase/supabase-js";
import { runWeeklySummaries } from "./weeklyJob";

let failures = 0;
function check(name: string, ok: boolean) {
  if (ok) console.log(`PASS - ${name}`);
  else { failures += 1; console.error(`FAIL - ${name}`); }
}

type Row = Record<string, unknown>;
// A small in-memory stand-in for the database: just the query shapes the job uses.
function fakeDb(tables: Record<string, Row[]>, users: Record<string, string>, clockIso: () => string) {
  class Query {
    private filters: ((r: Row) => boolean)[] = [];
    private head = false;
    private wantCount = false;
    private max = Infinity;
    constructor(private table: string) {}
    select(_columns: string, options?: { count?: string; head?: boolean }) { this.head = !!options?.head; this.wantCount = !!options?.count; return this; }
    eq(column: string, value: unknown) { this.filters.push((r) => r[column] === value); return this; }
    in(column: string, values: unknown[]) { this.filters.push((r) => values.includes(r[column])); return this; }
    gte(column: string, value: string) { this.filters.push((r) => new Date(String(r[column])).getTime() >= new Date(value).getTime()); return this; }
    lt(column: string, value: string) { this.filters.push((r) => new Date(String(r[column])).getTime() < new Date(value).getTime()); return this; }
    limit(n: number) { this.max = n; return this; }
    then(resolve: (v: unknown) => unknown) {
      const rows = (tables[this.table] ?? []).filter((r) => this.filters.every((f) => f(r))).slice(0, this.max);
      return resolve({ data: this.head ? null : rows, count: this.wantCount || this.head ? rows.length : null, error: null });
    }
  }
  const claims: string[] = [];
  const client = {
    from: (table: string) => new Query(table),
    rpc: async (name: string, args: { p_business_id: string; p_week_start: string }) => {
      if (name !== "claim_weekly_summary") return { data: null, error: new Error("unknown rpc") };
      const business = tables.businesses.find((b) => b.id === args.p_business_id);
      const last = business?.last_weekly_summary_at as string | null | undefined;
      if (!business || (last && new Date(last) >= new Date(args.p_week_start))) return { data: false, error: null };
      business.last_weekly_summary_at = clockIso();
      claims.push(args.p_business_id);
      return { data: true, error: null };
    },
    auth: { admin: { getUserById: async (id: string) => ({ data: { user: { email: users[id] } } }) } },
  };
  return { client: client as unknown as SupabaseClient, claims };
}

const FUTURE = "2099-01-01T00:00:00Z";
const PAST = "2020-01-01T00:00:00Z";
const sub = (id: string, expires: string) => ({ business_id: id, plan: "standard", status: "active", trial_started_at: null, trial_ends_at: null, expires_at: expires });
const biz = (id: string, name: string) => ({ id, name, timezone: "Africa/Lagos", currency: "NGN", last_weekly_summary_at: null as string | null });
const weekdays = [1, 2, 3, 4, 5].map((d) => ({ business_id: "b1", day_of_week: d, opens_at: "09:00:00", closes_at: "18:00:00" }));

function world() {
  const tables: Record<string, Row[]> = {
    business_subscriptions: [sub("b1", FUTURE), sub("b2", PAST), sub("b3", FUTURE), sub("b4", FUTURE)],
    businesses: [biz("b1", "Ada's Bakery"), biz("b2", "Lapsed Ltd"), biz("b3", "Quiet Co"), biz("b4", "Late Starter")],
    business_hours: weekdays,
    // last week = Mon 2 Nov 00:00 to Mon 9 Nov 00:00, Lagos time
    conversations: [
      { business_id: "b1", started_at: "2026-11-02T09:00:00Z", needs_human: false },   // Mon 10:00, open
      { business_id: "b1", started_at: "2026-11-03T20:00:00Z", needs_human: false },   // Tue 21:00, after hours
      { business_id: "b1", started_at: "2026-11-07T10:00:00Z", needs_human: true },    // Sat, closed, waiting now
      { business_id: "b1", started_at: "2026-10-20T10:00:00Z", needs_human: false },   // too old
      { business_id: "b1", started_at: "2026-11-09T09:00:00Z", needs_human: false },   // this week, not counted
      { business_id: "b4", started_at: "2026-11-04T10:00:00Z", needs_human: false },
    ],
    messages: [
      ...Array.from({ length: 5 }, () => ({ business_id: "b1", role: "assistant", created_at: "2026-11-03T10:00:00Z" })),
      { business_id: "b1", role: "customer", created_at: "2026-11-03T10:00:00Z" },
      { business_id: "b4", role: "assistant", created_at: "2026-11-04T10:00:00Z" },
    ],
    orders: [
      { business_id: "b1", status: "placed", total: 2500, created_at: "2026-11-03T10:00:00Z" },
      { business_id: "b1", status: "delivered", total: 29000, created_at: "2026-11-04T10:00:00Z" },
      { business_id: "b1", status: "cancelled", total: 99999, created_at: "2026-11-04T10:00:00Z" },
    ],
    business_owners: [
      { business_id: "b1", user_id: "u-owner", role: "owner", weekly_summary: true },
      { business_id: "b1", user_id: "u-staff", role: "staff", weekly_summary: true },
      { business_id: "b1", user_id: "u-optout", role: "owner", weekly_summary: false },
      { business_id: "b3", user_id: "u-quiet", role: "owner", weekly_summary: true },
      { business_id: "b4", user_id: "u-late", role: "owner", weekly_summary: true },
    ],
  };
  const users = { "u-owner": "Ada@Bakery.test", "u-staff": "staff@bakery.test", "u-optout": "optout@bakery.test", "u-quiet": "quiet@co.test", "u-late": "late@start.test" };
  return { tables, users };
}

async function main() {
  const MONDAY = new Date("2026-11-09T08:00:00Z");
  const sent: { to: string; subject: string; html: string }[] = [];
  const { tables, users } = world();
  const { client, claims } = fakeDb(tables, users, () => MONDAY.toISOString());
  const send = async (m: { to: string; subject: string; html: string }) => { sent.push(m); };

  const first = await runWeeklySummaries(client, send, "https://app.test", MONDAY);
  const toB1 = sent.filter((m) => m.subject.includes("Ada's Bakery"));
  check("Monday: the paying business's owner gets one summary", toB1.length === 1 && toB1[0].to === "ada@bakery.test");
  check("it is not sent to staff or to an owner who turned it off", !sent.some((m) => /staff@|optout@/.test(m.to)));
  check("the numbers are last week's own data (3 chats, 2 orders)", toB1[0].subject === "Last week on Ada's Bakery: 3 chats, 2 orders");
  check("cancelled orders are not counted; sales are the real total", /₦31,500/.test(toB1[0].html) && !/99,999/.test(toB1[0].html));
  check("Mira's replies are counted, not the customer's messages", /<b>5 replies<\/b>/.test(toB1[0].html));
  check("chats outside opening hours are counted (the Tuesday evening and Saturday ones)", /<b>2 chats<\/b> started outside your opening hours/.test(toB1[0].html));
  check("the customer waiting right now is flagged", /1 customer is waiting for you right now/.test(toB1[0].html));
  check("the email links to this business's own pages", toB1[0].html.includes("https://app.test/portal/b1/settings") && toB1[0].html.includes("https://app.test/portal/b1/conversations"));
  check("a lapsed business gets nothing and is not even claimed", !sent.some((m) => m.subject.includes("Lapsed")) && !claims.includes("b2"));
  check("a quiet week sends nothing, but the week is marked done", !sent.some((m) => m.subject.includes("Quiet Co")) && claims.includes("b3"));
  check("another business's activity does not leak in", sent.filter((m) => m.subject.includes("Late Starter")).length === 1 && /1 chat/.test(sent.find((m) => m.subject.includes("Late Starter"))!.subject));
  check("run report: three businesses processed, two emails sent", first.checked === 3 && first.sent === 2);

  const afterFirst = sent.length;
  await runWeeklySummaries(client, send, "https://app.test", MONDAY);
  check("running the job again the same day sends nothing", sent.length === afterFirst);
  await runWeeklySummaries(client, send, "https://app.test", new Date("2026-11-10T08:00:00Z"));
  check("Tuesday's run does not resend the same week", sent.length === afterFirst);
  const thursday = await runWeeklySummaries(client, send, "https://app.test", new Date("2026-11-12T08:00:00Z"));
  check("Thursday to Sunday: nothing is due", sent.length === afterFirst && thursday.checked === 0);

  // a business that was added after Monday gets its first one the following Monday
  const next = world();
  next.tables.businesses.find((b) => b.id === "b4")!.last_weekly_summary_at = null;
  const sent2: { to: string; subject: string; html: string }[] = [];
  const db2 = fakeDb(next.tables, next.users, () => "2026-11-12T08:00:00Z");
  await runWeeklySummaries(db2.client, async (m) => { sent2.push(m); }, "https://app.test", new Date("2026-11-12T08:00:00Z"));
  check("a Thursday run claims and sends nothing", sent2.length === 0 && db2.claims.length === 0);

  // one failing address must not stop the others
  const failing = world();
  const sent3: string[] = [];
  const db3 = fakeDb(failing.tables, failing.users, () => MONDAY.toISOString());
  const report = await runWeeklySummaries(db3.client, async (m) => { if (m.to === "ada@bakery.test") throw new Error("mailbox full"); sent3.push(m.to); }, "https://app.test", MONDAY);
  check("a failed email for one business does not stop the others", sent3.includes("late@start.test") && report.sent === 1);
  const sent4: string[] = [];
  await runWeeklySummaries(db3.client, async (m) => { sent4.push(m.to); }, "https://app.test", new Date("2026-11-10T08:00:00Z"));
  check("a failed week is not retried (at most once per week, never twice)", sent4.length === 0);

  // a lapsed plan that renews gets summaries again
  const renewed = world();
  renewed.tables.business_subscriptions.find((s) => s.business_id === "b2")!.expires_at = FUTURE;
  const sent5: string[] = [];
  await runWeeklySummaries(fakeDb(renewed.tables, renewed.users, () => MONDAY.toISOString()).client, async (m) => { sent5.push(m.subject); }, "https://app.test", MONDAY);
  check("a business with no activity and a renewed plan still sends nothing", !sent5.some((s) => s.includes("Lapsed")));

  if (failures) { console.error(`${failures} check(s) failed`); process.exit(1); }
}
void main();
