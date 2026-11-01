"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";
import type { ThemePreference } from "@/lib/theme";

const OPTIONS: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

/** The Appearance card shown in portal and admin settings. */
export function ThemeToggle() {
  const { preference, resolved, setPreference } = useTheme();
  const index = Math.max(0, OPTIONS.findIndex((o) => o.value === preference));
  return (
    <section className="ui-card space-y-3" aria-labelledby="appearance-heading">
      <div>
        <p className="ui-section-label ml-0">Appearance</p>
        <h2 id="appearance-heading" className="text-lg font-semibold tracking-tight">Theme</h2>
        <p className="ui-subtitle mt-0">
          Choose light or dark, or follow your device. This applies on this browser only
          {preference === "system" ? ` (your device is using ${resolved} right now).` : "."}
        </p>
      </div>
      <div role="radiogroup" aria-label="Theme" className="ui-segmented" style={{ "--n": OPTIONS.length, "--i": index } as React.CSSProperties}>
        <span aria-hidden className="ui-segmented-thumb" />
        {OPTIONS.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={preference === value}
            onClick={() => setPreference(value)}
            className="ui-segment inline-flex items-center justify-center gap-1.5"
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>
    </section>
  );
}
