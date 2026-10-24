"use client";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const CloseContext = createContext<(() => void) | null>(null);

/** Forms rendered inside a sheet call this after a successful save to dismiss it. Outside a sheet it does nothing. */
export function useSheetClose(): () => void {
  return useContext(CloseContext) ?? (() => {});
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const scrollY = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    // Move focus into the sheet (first field, else the panel) and give it back on close.
    const first = panelRef.current?.querySelector<HTMLElement>("input,select,textarea,button:not([data-sheet-close])");
    (first ?? panelRef.current)?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = scrollY;
      previous?.focus();
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="ui-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="ui-sheet outline-none">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id={titleId} className="text-lg font-semibold tracking-tight text-slate-900">{title}</h2>
          <button type="button" data-sheet-close onClick={onClose} className="ui-btn ui-btn-plain ui-btn-sm" aria-label="Close">Done</button>
        </div>
        <CloseContext.Provider value={onClose}>{children}</CloseContext.Provider>
      </div>
    </div>,
    document.body,
  );
}

/** A primary "Add ..." button that opens its form in a sheet, so the list stays the focus of the page. */
export function AddSheet({ label, title, children }: { label: string; title?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button type="button" className="ui-btn ui-btn-primary" onClick={() => setOpen(true)}>
        <span aria-hidden className="text-lg leading-none">+</span>
        {label}
      </button>
      <Sheet open={open} onClose={close} title={title ?? label}>{children}</Sheet>
    </>
  );
}
