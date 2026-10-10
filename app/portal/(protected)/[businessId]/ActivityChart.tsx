"use client";

import { useId, useState } from "react";
import { BarChart3, LineChart } from "lucide-react";
import { naira } from "@/lib/site/format";

export type ChartPoint = { label: string; value: number };
// Plain data only (a Server Component passes this in), so the number format is a
// named kind rather than a function.
export type ChartMetric = { id: string; title: string; kind: "count" | "money"; points: ChartPoint[]; emptyMessage: string };

const W = 640;
const H = 160;
const PAD = { top: 12, right: 8, bottom: 8, left: 8 };

const formatters = {
  count: (n: number) => n.toLocaleString("en-NG"),
  money: (n: number) => naira(n),
};

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { id: T; text: React.ReactNode; aria?: string }[];
  onChange: (id: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-full border border-line bg-surface p-0.5 text-xs">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={value === option.id}
          aria-label={option.aria}
          onClick={() => onChange(option.id)}
          className={`inline-flex items-center rounded-full px-3 py-1 font-medium transition ${value === option.id ? "bg-ink text-white" : "text-muted hover:text-ink"}`}
        >
          {option.text}
        </button>
      ))}
    </div>
  );
}

// One card, one or two metrics (conversations, sales), switchable between a line and
// bars and between the last 7 and 30 days. The line draws itself and the bars grow on
// every change; both are switched off for people who prefer reduced motion.
export function ActivityPanel({ metrics }: { metrics: ChartMetric[] }) {
  const gradientId = useId();
  const [metricId, setMetricId] = useState(metrics[0]?.id ?? "");
  const [view, setView] = useState<"line" | "bars">("line");
  const [range, setRange] = useState<"7" | "30">("30");
  const [hover, setHover] = useState<number | null>(null);

  const metric = metrics.find((m) => m.id === metricId) ?? metrics[0];
  if (!metric) return null;
  const format = formatters[metric.kind];
  const points = range === "7" ? metric.points.slice(-7) : metric.points;

  const total = points.reduce((sum, p) => sum + p.value, 0);
  const max = Math.max(...points.map((p) => p.value), 1);
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const step = points.length > 1 ? innerW / (points.length - 1) : 0;
  const x = (i: number) => PAD.left + i * step;
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  const barSlot = innerW / points.length;
  const barX = (i: number) => PAD.left + i * barSlot + barSlot * 0.2;

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const area = points.length ? `${line} L${x(points.length - 1).toFixed(1)},${PAD.top + innerH} L${x(0).toFixed(1)},${PAD.top + innerH} Z` : "";
  const active = hover !== null ? points[hover] : null;

  function onMove(event: React.MouseEvent<SVGSVGElement>) {
    if (points.length < 2) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * W;
    const index = view === "bars" ? Math.floor((px - PAD.left) / barSlot) : Math.round(((px - PAD.left) / innerW) * (points.length - 1));
    setHover(Math.min(points.length - 1, Math.max(0, index)));
  }

  const hoverCx = hover === null ? 0 : view === "bars" ? barX(hover) + barSlot * 0.3 : x(hover);

  return (
    <section className="glass-panel rounded-2xl p-5" aria-label="Activity">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          {metrics.length > 1 ? (
            <Segmented
              label="Metric"
              value={metric.id}
              options={metrics.map((m) => ({ id: m.id, text: m.title }))}
              onChange={(id) => {
                setMetricId(id);
                setHover(null);
              }}
            />
          ) : (
            <h2 className="font-medium text-ink">{metric.title}</h2>
          )}
          <p className="text-xs text-muted">Last {range} days</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            label="Range"
            value={range}
            options={[
              { id: "7", text: "7d" },
              { id: "30", text: "30d" },
            ]}
            onChange={(id) => {
              setRange(id);
              setHover(null);
            }}
          />
          <Segmented
            label="Chart type"
            value={view}
            options={[
              { id: "line", text: <LineChart className="h-3.5 w-3.5" aria-hidden="true" />, aria: "Line chart" },
              { id: "bars", text: <BarChart3 className="h-3.5 w-3.5" aria-hidden="true" />, aria: "Bar chart" },
            ]}
            onChange={setView}
          />
        </div>
      </div>

      <p className="mt-3 text-sm text-ink-2" aria-live="polite">
        <span className="text-2xl font-semibold tracking-tight text-ink">{format(active ? active.value : total)}</span>
        <span className="ml-2 text-xs text-muted">{active ? active.label : "in total"}</span>
      </p>

      {total === 0 ? (
        <div className="mt-3 flex h-[140px] items-center justify-center rounded-xl border border-dashed border-line text-center text-sm text-muted">
          <p className="max-w-xs px-4">{metric.emptyMessage}</p>
        </div>
      ) : (
        <div className="relative mt-3">
          {/* key replays the animation whenever the metric, range or type changes */}
          <svg
            key={`${metric.id}-${view}-${range}`}
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="block h-44 w-full"
            role="img"
            aria-label={`${metric.title}: ${format(total)} in the last ${range} days`}
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
              <line key={t} x1={PAD.left} x2={W - PAD.right} y1={PAD.top + innerH * t} y2={PAD.top + innerH * t} stroke="var(--color-line)" strokeDasharray="3 5" vectorEffect="non-scaling-stroke" />
            ))}
            {view === "line" ? (
              <>
                <path d={area} fill={`url(#${gradientId})`} className="animate-area motion-reduce:animate-none" />
                <path
                  d={line}
                  pathLength={1}
                  strokeDasharray={1}
                  strokeDashoffset={0}
                  fill="none"
                  stroke="var(--color-ink)"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                  className="animate-draw motion-reduce:animate-none"
                />
                {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + innerH} stroke="var(--color-ink)" strokeOpacity={0.25} vectorEffect="non-scaling-stroke" />}
              </>
            ) : (
              points.map((p, i) => {
                const height = Math.max((p.value / max) * innerH, p.value > 0 ? 2 : 0);
                return (
                  <rect
                    key={i}
                    x={barX(i)}
                    y={PAD.top + innerH - height}
                    width={barSlot * 0.6}
                    height={height}
                    rx={2}
                    fill={hover === i ? "var(--color-marigold)" : "var(--color-ink)"}
                    className="origin-bottom animate-grow [transform-box:fill-box] motion-reduce:animate-none"
                    style={{ animationDelay: `${i * 12}ms` }}
                  />
                );
              })
            )}
          </svg>
          {view === "line" && hover !== null && points[hover] && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ink bg-marigold"
              style={{ left: `${(hoverCx / W) * 100}%`, top: `${(y(points[hover].value) / H) * 100}%` }}
            />
          )}
          <div className="mt-1 flex justify-between text-xs text-muted">
            <span>{points[0]?.label}</span>
            <span>{points[points.length - 1]?.label}</span>
          </div>
        </div>
      )}
    </section>
  );
}
