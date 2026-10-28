"use client";

import { useState } from "react";

/** Long text starts short, with a clear way to read the rest. Short text is shown as is. */
export function ReadMore({ text, limit = 180, lines = 3, className = "" }: { text: string; limit?: number; lines?: number; className?: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > limit;
  return (
    <div className={className}>
      <p className={long && !open ? "break-words" : "break-words"} style={long && !open ? { display: "-webkit-box", WebkitLineClamp: lines, WebkitBoxOrient: "vertical", overflow: "hidden" } : undefined}>{text}</p>
      {long && (
        <button type="button" className="mt-1 text-sm font-semibold text-accent hover:underline" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? "Show less" : "Read more"}
        </button>
      )}
    </div>
  );
}
