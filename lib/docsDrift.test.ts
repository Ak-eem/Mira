// Keeps the docs honest: every environment variable the code reads is listed in .env.example, and every
// migration file a doc names actually exists. Run by `npm test`.
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

let failures = 0;
function check(label: string, pass: boolean, detail = "") { if (!pass) { failures++; console.error(`FAIL: ${label}${detail ? ` -- ${detail}` : ""}`); } else console.log(`ok: ${label}`); }

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

// Set by the platform, not by the person deploying.
const PLATFORM_VARS = new Set(["NODE_ENV", "VERCEL_URL", "VERCEL_ENV", "NEXT_RUNTIME", "CI"]);

const used = new Set<string>();
for (const dir of ["app", "lib", "components"]) for (const file of walk(dir)) for (const m of readFileSync(file, "utf8").matchAll(/process\.env\.([A-Z][A-Z0-9_]+)/g)) used.add(m[1]);
const documented = new Set([...readFileSync(".env.example", "utf8").matchAll(/^#?\s*([A-Z][A-Z0-9_]+)=/gm)].map((m) => m[1]));
const undocumented = [...used].filter((v) => !documented.has(v) && !PLATFORM_VARS.has(v));
check("every environment variable the code reads is in .env.example", undocumented.length === 0, undocumented.join(", "));

const migrations = new Set(readdirSync("supabase/migrations"));
for (const doc of readdirSync("docs").filter((f) => f.endsWith(".md")).concat(["../README.md"])) {
  const text = readFileSync(join("docs", doc), "utf8");
  const named = [...text.matchAll(/\b(\d{4}_[a-z0-9_]+\.sql|\d{14}_[a-z0-9_]+\.sql)\b/g)].map((m) => m[1]);
  const missing = named.filter((n) => !migrations.has(n));
  check(`migration files named in ${doc.replace("../", "")} exist`, missing.length === 0, missing.join(", "));
}
const stale = ["NEXT_PUBLIC_SUPABASE_ANON_KEY"].filter((name) => readdirSync("docs").some((f) => existsSync(join("docs", f)) && readFileSync(join("docs", f), "utf8").includes(name)));
check("docs use the current Supabase key name", stale.length === 0, stale.join(", "));
if (failures) { console.error(`${failures} check(s) failed`); process.exit(1); }
