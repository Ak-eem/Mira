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
  const drag = useRef<{ startY: number; dy: number } | null>(null);

  // Drag the handle down to dismiss (phones): the sheet follows the finger, and closes if pulled far enough.
  function onGrabStart(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startY: e.clientY, dy: 0 };
  }
  function onGrabMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!drag.current || !panelRef.current) return;
    drag.current.dy = Math.max(0, e.clientY - drag.current.startY);
    panelRef.current.style.transition = "none";
    panelRef.current.style.transform = `translateY(${drag.current.dy}px)`;
  }
  function onGrabEnd() {
    const panel = panelRef.current;
    const dy = drag.current?.dy ?? 0;
    drag.current = null;
    if (!panel) return;
    if (dy > 110) { onClose(); return; }
    panel.style.transition = "transform 260ms var(--ui-ease)";
    panel.style.transform = "";
  }

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
        <div className="ui-grabber" aria-hidden="true" onPointerDown={onGrabStart} onPointerMove={onGrabMove} onPointerUp={onGrabEnd} onPointerCancel={onGrabEnd} />
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
export function AddSheet({ label, title, children, fab = false }: { label: string; title?: string; children: ReactNode; fab?: boolean }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      {/* On phones the main action of a screen floats (fab); on larger screens it stays a normal button. */}
      <button type="button" className={`ui-btn ui-btn-primary ${fab ? "hidden sm:inline-flex" : ""}`} onClick={() => setOpen(true)}>
        <span aria-hidden className="text-lg leading-none">+</span>
        {label}
      </button>
      {fab && <button type="button" className="ui-fab sm:hidden" aria-label={label} onClick={() => setOpen(true)}>+</button>}
      <Sheet open={open} onClose={close} title={title ?? label}>{children}</Sheet>
    </>
  );
}
