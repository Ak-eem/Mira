// Light/dark theme preference for the business portal and admin.
// Stored per browser (localStorage); nothing is saved to the database.

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "mira-theme";
export const DEFAULT_THEME_PREFERENCE: ThemePreference = "light";

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  if (preference === "system") return systemPrefersDark ? "dark" : "light";
  return preference;
}

// Runs before first paint (inlined in the portal and admin layouts) so a
// dark-mode user never sees a flash of the light theme. Keep it dependency
// free and wrapped in try/catch: storage can throw in private windows.
export const THEME_INIT_SCRIPT = `(function(){try{var p=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});var d=p==="dark"||(p==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light";}catch(e){}})();`;
