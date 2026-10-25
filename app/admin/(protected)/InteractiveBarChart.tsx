"use client";

import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { tooltipFor, type BarPoint } from "@/lib/admin/barTooltip";

type Props = { title: string; points: BarPoint[]; seriesNames?: string[]; suffix?: string };

const GAP = 16;

// Bars that grow in, and a tooltip that glides after the cursor and changes its content as you move from bar to bar.
// Works with the keyboard (Tab to a bar) and with touch (tap a bar); honours reduced motion.
export function InteractiveBarChart({ title, points, seriesNames = ["Value"], suffix = "" }: Props) {
  const areaRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<number | null>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  // Off for the first frame after the tooltip appears, so it appears at the cursor instead of flying in from its last spot.
  const [glide, setGlide] = useState(false);

  const maximum = Math.max(1, ...points.map((p) => p.value), ...points.map((p) => p.secondary ?? 0));
  const barHeight = (value: number) => `${Math.max((value / maximum) * 100, value ? 4 : 0)}%`;
  const empty = points.length === 0 || points.every((p) => p.value === 0 && (p.secondary ?? 0) === 0);
  const hasSecondary = points.some((p) => p.secondary !== undefined);
  const data = active === null ? null : tooltipFor(points, active, seriesNames, suffix);

  function place(clientX: number, clientY: number) {
    const area = areaRef.current;
    if (!area) return;
    const rect = area.getBoundingClientRect();
    const tipWidth = tipRef.current?.offsetWidth ?? 190;
    const tipHeight = tipRef.current?.offsetHeight ?? 90;
    let x = clientX - rect.left + GAP;
    if (x + tipWidth > rect.width) x = clientX - rect.left - tipWidth - GAP; // flip to the cursor's left near the right edge
    const y = clientY - rect.top - tipHeight - 12;
    setPos({ x: Math.max(0, x), y: Math.max(-tipHeight + 8, y) });
  }

  function show(index: number, e: ReactPointerEvent) {
    if (active === null) {
      setGlide(false);
      place(e.clientX, e.clientY);
      requestAnimationFrame(() => setGlide(true));
    }
    setActive(index);
  }

  return (
    <section className="glass-panel rounded-xl p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
        {hasSecondary && !empty && (
          <p className="flex items-center gap-3 text-[11px] text-slate-500">
            <span className="flex items-center gap-1"><span aria-hidden className="h-2 w-2 rounded-full bg-accent" />{seriesNames[0]}</span>
            <span className="flex items-center gap-1"><span aria-hidden className="h-2 w-2 rounded-full bg-amber-400" />{seriesNames[1]}</span>
          </p>
        )}
      </div>

      {empty ? (
        <p className="text-sm text-slate-500">Nothing to show for this period yet.</p>
      ) : (
        <div
          ref={areaRef}
          className="relative flex h-40 items-end justify-center gap-2"
          onPointerMove={(e) => active !== null && place(e.clientX, e.clientY)}
          onPointerLeave={() => setActive(null)}
        >
          <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-5 top-4 flex flex-col justify-between">
            <span className="h-px bg-slate-200/70" />
            <span className="h-px bg-slate-200/70" />
            <span className="h-px bg-slate-200/70" />
          </div>

          {points.map((point, index) => {
            const isActive = active === index;
            const dimmed = active !== null && !isActive;
            const summary = `${point.label}: ${point.value} ${seriesNames[0]}${point.secondary !== undefined ? `, ${point.secondary} ${seriesNames[1] ?? ""}` : ""}`;
            return (
              <div
                key={point.label}
                tabIndex={0}
                role="img"
                aria-label={summary}
                className={`bar-col relative flex min-w-0 max-w-24 flex-1 cursor-default flex-col items-center gap-1 rounded-md outline-none transition-opacity duration-200 focus-visible:ring-2 focus-visible:ring-accent/40 motion-reduce:transition-none ${dimmed ? "opacity-75" : ""}`}
                style={{ "--bar-delay": `${Math.min(index, 14) * 55}ms` } as CSSProperties}
                onPointerEnter={(e) => show(index, e)}
                onFocus={(e) => {
                  const area = areaRef.current?.getBoundingClientRect();
                  const col = e.currentTarget.getBoundingClientRect();
                  if (area) {
                    setGlide(true);
                    place(col.left + col.width / 2, col.top);
                  }
                  setActive(index);
                }}
                onBlur={() => setActive(null)}
              >
                <span className={`bar-label text-[10px] font-medium tabular-nums transition-colors ${isActive ? "text-slate-900" : "text-slate-500"}`}>{point.value}{suffix}</span>
                <div className="flex h-28 w-full items-end gap-0.5">
                  <div className={`bar-grow w-full rounded-t bg-accent transition-[filter,transform] duration-200 motion-reduce:transition-none ${isActive ? "-translate-y-1 brightness-110" : ""}`} style={{ height: barHeight(point.value) }} />
                  {point.secondary !== undefined && (
                    <div className={`bar-grow w-full rounded-t bg-amber-400 transition-[filter,transform] duration-200 motion-reduce:transition-none ${isActive ? "-translate-y-1 brightness-110" : ""}`} style={{ height: barHeight(point.secondary) }} />
                  )}
                </div>
                <span className={`max-w-full truncate text-[10px] transition-colors ${isActive ? "font-medium text-slate-800" : "text-slate-500"}`}>{point.label}</span>
              </div>
            );
          })}

          <div
            ref={tipRef}
            aria-hidden="true"
            className={`pointer-events-none absolute left-0 top-0 z-20 w-max min-w-40 max-w-60 rounded-xl border border-white/80 bg-white p-3 shadow-xl shadow-slate-900/15 will-change-transform motion-reduce:transition-none ${glide ? "transition-[transform,opacity] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]" : "transition-opacity duration-150"} ${data ? "opacity-100" : "opacity-0"}`}
            style={{ transform: `translate3d(${pos.x}px, ${pos.y}px, 0)` }}
          >
            {data && (
              <div key={active} className="tip-swap space-y-1.5">
                <p className="text-xs font-semibold text-slate-900">{data.label}</p>
                {data.rows.map((row) => (
                  <p key={row.name} className="flex items-center justify-between gap-4 text-xs text-slate-700">
                    <span className="flex items-center gap-1.5">
                      <span aria-hidden className={`h-2 w-2 rounded-full ${row.series === "primary" ? "bg-accent" : "bg-amber-400"}`} />
                      {row.name}
                    </span>
                    <span className="tabular-nums"><strong className="font-semibold text-slate-900">{row.value}{suffix}</strong> <span className="text-slate-500">({row.share})</span></span>
                  </p>
                ))}
                {data.change && (
                  <p className={`text-[11px] font-medium ${data.change.direction === "up" ? "text-emerald-600" : data.change.direction === "down" ? "text-red-600" : "text-slate-500"}`}>
                    {data.change.direction === "up" ? "\u25B2 " : data.change.direction === "down" ? "\u25BC " : ""}{data.change.text}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
