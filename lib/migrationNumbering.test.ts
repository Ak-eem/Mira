import { readdirSync } from "node:fs";

const migrationFiles = readdirSync("supabase/migrations").filter((file) => file.endsWith(".sql"));
const versions = new Map<string, string[]>();

for (const file of migrationFiles) {
  const match = /^(\d{4})_.+\.sql$/.exec(file);
  if (!match) {
    console.error(`FAIL: migration filename has no four-digit version: ${file}`);
    process.exitCode = 1;
    continue;
  }
  const files = versions.get(match[1]) ?? [];
  files.push(file);
  versions.set(match[1], files);
}

for (const [version, files] of versions) {
  if (files.length > 1) {
    console.error(`FAIL: migration version ${version} is duplicated: ${files.join(", ")}`);
    process.exitCode = 1;
  }
}

if (process.exitCode) {
  process.exitCode = 1;
} else {
  console.log("PASS: migration versions are unique");
}
