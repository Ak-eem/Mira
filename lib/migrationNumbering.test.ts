// Run with `npx tsx lib/migrationNumbering.test.ts`.
// Two migrations once shared a number (0067 twice, then 0068 twice) because branches were numbered in parallel.
// The migration history records the number as the version, so duplicates are ambiguous to apply and to track.
// This fails the build if it happens again.
import { readdirSync } from "node:fs";

function check(label: string, pass: boolean, detail = "") {
  console.log(`${pass ? "PASS" : "FAIL"} — ${label}${pass || !detail ? "" : ` (${detail})`}`);
  if (!pass) process.exitCode = 1;
}

const files = readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort();
const badNames = files.filter((f) => !/^\d{4}_[a-z0-9_]+\.sql$/.test(f));
check("every migration is named NNNN_snake_case_name.sql", badNames.length === 0, badNames.join(", "));

const byNumber = new Map<string, string[]>();
for (const file of files) byNumber.set(file.slice(0, 4), [...(byNumber.get(file.slice(0, 4)) ?? []), file]);
const duplicates = [...byNumber.entries()].filter(([, names]) => names.length > 1);
check(
  "no two migrations share a number (renumber yours to the next free one)",
  duplicates.length === 0,
  duplicates.map(([number, names]) => `${number}: ${names.join(" + ")}`).join("; "),
);
check("there are migrations to check", files.length > 60);
