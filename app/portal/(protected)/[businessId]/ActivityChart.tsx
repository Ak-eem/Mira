"use client";

import { useId, useState } from "react";

export type ChartPoint = { label: string; value: number };

const W = 640;
const H = 180;
const PAD = { top: 12, right: 8, bottom: 22, left: 8 };

// A small dependency-free line chart. The line draws itself on mount and the area
// fades in; both are switched off for people who prefer reduced motion.
export function ActivityChart({
  title,
  subtitle,
  points,
  format = (n: number) => String(n),
  emptyMessage,
}: {
  title: string;
  subtitle?: string;
  points: ChartPoint[];
  format?: (n: number) => string;
  emptyMessage: string;
}) {
  const gradientId = useId();
  const [hover, setHover] = useState<number | null>(null);
  const total = points.reduce((sum, p) => sum + p.value, 0);
  const max = Math.max(...points.map((p) => p.value), 1);
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const step = points.length > 1 ? innerW / (points.length - 1) : 0;
  const x = (i: number) => PAD.left + i * step;
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const area = points.length ? `${line} L${x(points.length - 1).toFixed(1)},${PAD.top + innerH} L${x(0).toFixed(1)},${PAD.top + innerH} Z` : "";
  const active = hover !== null ? points[hover] : null;

  function onMove(event: React.MouseEvent<SVGSVGElement>) {
    if (points.length < 2) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    const index = Math.round(((ratio * W - PAD.left) / innerW) * (points.length - 1));
    setHover(Math.min(points.length - 1, Math.max(0, index)));
  }

  return (
    <section className="glass-panel rounded-2xl p-5" aria-label={title}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-medium text-ink">{title}</h2>
          {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
        </div>
        <p className="text-right text-sm text-ink-2" aria-live="polite">
          {active ? (
            <>
              <span className="font-semibold text-ink">{format(active.value)}</span>
              <span className="block text-xs text-muted">{active.label}</span>
            </>
          ) : (
            <span className="font-semibold text-ink">{format(total)}</span>
          )}
        </p>
      </div>

      {total === 0 ? (
        <div className="mt-4 flex h-[140px] items-center justify-center rounded-xl border border-dashed border-line text-center text-sm text-muted">
          <p className="max-w-xs px-4">{emptyMessage}</p>
        </div>
      ) : (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="mt-3 h-auto w-full"
          role="img"
          aria-label={`${title}: ${format(total)} in total`}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-marigold)" stopOpacity="0.35" />
              <stop offset="100%" stopColor="var(--color-marigold)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((t) => (
            <line key={t} x1={PAD.left} x2={W - PAD.right} y1={PAD.top + innerH * t} y2={PAD.top + innerH * t} stroke="var(--color-line)" strokeDasharray="3 5" />
          ))}
          <path d={area} fill={`url(#${gradientId})`} className="animate-area motion-reduce:animate-none" />
          <path
            d={line}
            pathLength={1}
            strokeDasharray={1}
            strokeDashoffset={0}
            fill="none"
            stroke="var(--color-ink)"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="animate-draw motion-reduce:animate-none"
          />
          {hover !== null && points[hover] && (
            <>
              <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + innerH} stroke="var(--color-ink)" strokeOpacity={0.25} />
              <circle cx={x(hover)} cy={y(points[hover].value)} r={5} fill="var(--color-marigold)" stroke="var(--color-ink)" strokeWidth={2} />
            </>
          )}
          <text x={PAD.left} y={H - 6} fontSize="11" fill="var(--color-muted)">
            {points[0]?.label}
          </text>
          <text x={W - PAD.right} y={H - 6} fontSize="11" textAnchor="end" fill="var(--color-muted)">
            {points[points.length - 1]?.label}
          </text>
        </svg>
      )}
    </section>
  );
}
