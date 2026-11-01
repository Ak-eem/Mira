import assert from "node:assert/strict";
import { isThemePreference, resolveTheme, THEME_INIT_SCRIPT, THEME_STORAGE_KEY } from "./theme";

assert.equal(isThemePreference("light"), true);
assert.equal(isThemePreference("dark"), true);
assert.equal(isThemePreference("system"), true);
assert.equal(isThemePreference("blue"), false);
assert.equal(isThemePreference(null), false);

assert.equal(resolveTheme("light", true), "light");
assert.equal(resolveTheme("dark", false), "dark");
assert.equal(resolveTheme("system", true), "dark");
assert.equal(resolveTheme("system", false), "light");

// The inline script must read the same key the provider writes, and must run
// as plain JS: evaluate it against a fake browser and check the result.
assert.ok(THEME_INIT_SCRIPT.includes(JSON.stringify(THEME_STORAGE_KEY)));
function run(stored: string | null, systemDark: boolean, throws = false): string | undefined {
  const root: { dataset: Record<string, string> } = { dataset: {} };
  const fakeWindow = { matchMedia: () => ({ matches: systemDark }) };
  const fakeStorage = { getItem: () => { if (throws) throw new Error("blocked"); return stored; } };
  new Function("localStorage", "window", "document", THEME_INIT_SCRIPT)(fakeStorage, fakeWindow, { documentElement: root });
  return root.dataset.theme;
}
assert.equal(run("dark", false), "dark");
assert.equal(run("light", true), "light");
assert.equal(run("system", true), "dark");
assert.equal(run("system", false), "light");
assert.equal(run(null, true), "light");
assert.equal(run("dark", false, true), undefined);

console.log("theme tests passed");
