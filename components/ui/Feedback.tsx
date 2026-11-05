"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * The two ways Mira answers an action:
 *  - a snackbar: a small message at the bottom that confirms what you just did, offers Undo, and fades away;
 *  - a confirm dialog: interrupts only for something important or risky, with a calm default (Cancel) and a clearly marked action.
 * Mount <FeedbackProvider> once per app shell; call useSnackbar() / useConfirm() anywhere inside it.
 */

type SnackbarOptions = { message: string; actionLabel?: string; onAction?: () => void; duration?: number };
type ConfirmOptions = { title: string; description?: string; confirmLabel?: string; cancelLabel?: string; destructive?: boolean };

const SnackbarContext = createContext<((options: SnackbarOptions) => void) | null>(null);
const ConfirmContext = createContext<((options: ConfirmOptions) => Promise<boolean>) | null>(null);

export const useSnackbar = () => useContext(SnackbarContext) ?? (() => {});
/** Without a provider this falls back to the browser's confirm() so a missing mount never silently approves a delete. */
export const useConfirm = () =>
  useContext(ConfirmContext) ?? (async (o: ConfirmOptions) => (typeof window !== "undefined" ? window.confirm(o.description ? `${o.title}\n\n${o.description}` : o.title) : false));

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [snack, setSnack] = useState<(SnackbarOptions & { id: number }) | null>(null);
  const [leaving, setLeaving] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const counter = useRef(0);
  const [dialog, setDialog] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const dismiss = useCallback(() => {
    window.clearTimeout(timer.current);
    setLeaving(true);
    timer.current = window.setTimeout(() => { setSnack(null); setLeaving(false); }, 220);
  }, []);

  const show = useCallback((options: SnackbarOptions) => {
    window.clearTimeout(timer.current);
    setLeaving(false);
    counter.current += 1;
    setSnack({ ...options, id: counter.current });
    timer.current = window.setTimeout(dismiss, options.duration ?? (options.actionLabel ? 7000 : 4000));
  }, [dismiss]);

  const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => setDialog({ ...options, resolve })), []);
  const close = useCallback((ok: boolean) => { setDialog((d) => { d?.resolve(ok); return null; }); }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    if (!dialog) return;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialog, close]);

  return (
    <SnackbarContext.Provider value={show}>
      <ConfirmContext.Provider value={confirm}>
        {children}

        {snack && (
          <div className="ui-snack-wrap" role="status" aria-live="polite">
            <div key={snack.id} className={`ui-snack ${leaving ? "ui-snack-out" : ""}`} onMouseEnter={() => window.clearTimeout(timer.current)} onMouseLeave={() => { timer.current = window.setTimeout(dismiss, 2500); }}>
              <span aria-hidden className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-emerald-400/90 text-[13px] font-bold text-emerald-950">&#10003;</span>
              <span className="min-w-0 flex-1 text-[15px]">{snack.message}</span>
              {snack.actionLabel && (
                <button type="button" className="ui-snack-action" onClick={() => { snack.onAction?.(); dismiss(); }}>{snack.actionLabel}</button>
              )}
            </div>
          </div>
        )}

        {dialog && (
          <div className="ui-backdrop !items-center" onMouseDown={(e) => { if (e.target === e.currentTarget) close(false); }}>
            <div role="alertdialog" aria-modal="true" aria-labelledby="ui-confirm-title" aria-describedby={dialog.description ? "ui-confirm-desc" : undefined} className="ui-dialog">
              {dialog.destructive && (
                <span aria-hidden className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-red-50 text-red-600">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M6 6l1 14h10l1-14" /><path d="M10 11v5M14 11v5" /></svg>
                </span>
              )}
              <h2 id="ui-confirm-title" className="text-center text-lg font-semibold tracking-tight text-slate-900">{dialog.title}</h2>
              {dialog.description && <p id="ui-confirm-desc" className="ui-subtitle mx-auto mt-1 text-center">{dialog.description}</p>}
              <div className="mt-5 grid grid-cols-2 gap-3">
                <button ref={cancelRef} type="button" className="ui-btn ui-btn-secondary" onClick={() => close(false)}>{dialog.cancelLabel ?? "Cancel"}</button>
                <button type="button" className={`ui-btn ${dialog.destructive ? "ui-btn-destructive" : "ui-btn-primary"}`} onClick={() => close(true)}>{dialog.confirmLabel ?? (dialog.destructive ? "Delete" : "Confirm")}</button>
              </div>
            </div>
          </div>
        )}
      </ConfirmContext.Provider>
    </SnackbarContext.Provider>
  );
}
