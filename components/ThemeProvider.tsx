"use client";

import { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from "react";
import {
  DEFAULT_THEME_PREFERENCE,
  THEME_STORAGE_KEY,
  isThemePreference,
  resolveTheme,
  type ResolvedTheme,
  type ThemePreference,
} from "@/lib/theme";

// Preference store: localStorage is the source of truth, with an in-memory
// fallback so the toggle still works when storage is blocked.
const listeners = new Set<() => void>();
let memoryPreference: ThemePreference | null = null;

function readPreference(): ThemePreference {
  if (memoryPreference) return memoryPreference;
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemePreference(stored)) return stored;
  } catch {
    // storage unavailable: fall through to the default
  }
  return DEFAULT_THEME_PREFERENCE;
}

function writePreference(next: ThemePreference) {
  memoryPreference = next;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // keep the in-memory value for this tab
  }
  listeners.forEach((listener) => listener());
}

function subscribePreference(onChange: () => void) {
  listeners.add(onChange);
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY || event.key === null) {
      memoryPreference = null; // another tab changed it: re-read from storage
      onChange();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

const DARK_QUERY = "(prefers-color-scheme: dark)";
function subscribeSystem(onChange: () => void) {
  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

type ThemeContextValue = {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (next: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used inside ThemeProvider");
  return value;
}

/**
 * Wraps the portal and admin. Marks <html data-theme="light|dark"> while mounted
 * and removes it on the way out, so the landing page and chat widget are never
 * themed. The first paint is handled by THEME_INIT_SCRIPT, rendered by the layouts.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const preference = useSyncExternalStore(subscribePreference, readPreference, () => DEFAULT_THEME_PREFERENCE);
  const systemDark = useSyncExternalStore(
    subscribeSystem,
    () => window.matchMedia(DARK_QUERY).matches,
    () => false,
  );
  const resolved = resolveTheme(preference, systemDark);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = resolved;
    return () => {
      delete root.dataset.theme;
    };
  }, [resolved]);

  const value = useMemo<ThemeContextValue>(() => ({ preference, resolved, setPreference: writePreference }), [preference, resolved]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
