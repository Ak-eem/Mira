"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

/**
 * A setting that applies the moment you change it: the UI updates at once, the change is saved in the background,
 * "Saved" confirms it, and if saving fails the control snaps back and says why (iOS Settings behaves like this).
 */
export function useAutoSave<T>(save: (value: T) => Promise<{ error?: string | null }>, onSaved?: () => void) {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const run = useCallback(async (value: T, revert: () => void) => {
    window.clearTimeout(timer.current);
    setStatus("saving");
    setError(null);
    let result: { error?: string | null };
    try {
      result = await save(value);
    } catch {
      result = { error: "Could not save. Check your connection and try again." };
    }
    if (result.error) {
      revert();
      setError(result.error);
      setStatus("error");
      return;
    }
    setStatus("saved");
    timer.current = window.setTimeout(() => setStatus("idle"), 2500);
    onSaved?.();
  }, [save, onSaved]);

  return { status, error, run };
}
