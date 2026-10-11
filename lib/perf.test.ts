import { memoizeFor, timed } from "./perf";
let failures = 0;
function check(label: string, pass: boolean) { if (!pass) { failures++; console.error(`FAIL: ${label}`); } else console.log(`ok: ${label}`); }

(async () => {
  check("timed returns the value", (await timed("x", Promise.resolve(7))) === 7);
  check("timed accepts a function", (await timed("x", () => 8)) === 8);
  let threw = false;
  try { await timed("x", Promise.reject(new Error("boom"))); } catch (e) { threw = (e as Error).message === "boom"; }
  check("timed rethrows errors unchanged", threw);

  let t = 0; let calls = 0;
  const f = memoizeFor(1000, async () => { calls++; return calls; }, () => t);
  check("first call runs the function", (await f()) === 1);
  t = 500;
  check("a call inside the ttl is served from cache", (await f()) === 1 && calls === 1);
  t = 1500;
  check("a call after the ttl runs again", (await f()) === 2 && calls === 2);

  let n = 0;
  const g = memoizeFor(1000, async () => { n++; await new Promise((r) => setTimeout(r, 20)); return n; });
  const [a, b] = await Promise.all([g(), g()]);
  check("concurrent callers share one in-flight call", a === b && n === 1);

  let fail = true; let attempts = 0;
  const h = memoizeFor(1000, async () => { attempts++; if (fail) throw new Error("down"); return "ok"; });
  await h().catch(() => undefined);
  fail = false;
  check("a failure is not cached", (await h()) === "ok" && attempts === 2);
  if (failures) { console.error(`${failures} check(s) failed`); process.exit(1); }
})();
