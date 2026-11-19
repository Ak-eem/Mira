"use client";

import { useId, useMemo, useState } from "react";
import { RubberSegment } from "@/components/ui/RubberSegment";
import { naira } from "@/lib/site/format";

export type ChartPoint = { label: string; value: number };
export type ChartMetric = {
  id: string;
  title: string;
  kind: "count" | "money";
  points: ChartPoint[];
  emptyMessage: string;
};

const W = 760;
const H = 280;
const PAD = { top: 18, right: 14, bottom: 42, left: 58 };

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
  options: { id: T; text: string }[];
  onChange: (id: T) => void;
}) {
  return (
    <RubberSegment
      label={label}
      value={value}
      options={options.map((option) => ({ value: option.id, label: option.text }))}
      onChange={onChange}
      className="ui-rubber-segment-compact ui-rubber-segment-chart"
    />
  );
}

export function ActivityPanel({ metrics, className = "" }: { metrics: ChartMetric[]; className?: string }) {
  const gradientId = useId();
  const [metricId, setMetricId] = useState(metrics[0]?.id ?? "");
  const [view, setView] = useState<"line" | "bars">("line");
  const [range, setRange] = useState<"7" | "30">("30");
  const [hover, setHover] = useState<number | null>(null);

  const metric = metrics.find((item) => item.id === metricId) ?? metrics[0];
  const points = useMemo(() => {
    const metricPoints = metric?.points ?? [];
    return range === "7" ? metricPoints.slice(-7) : metricPoints;
  }, [metric?.points, range]);

  if (!metric) return null;

  const format = formatters[metric.kind];
  const total = points.reduce((sum, point) => sum + point.value, 0);
  const maxValue = Math.max(...points.map((point) => point.value), 0);
  const yMax = Math.max(4, Math.ceil(maxValue / 4) * 4);
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const baseline = PAD.top + innerH;
  const step = points.length > 1 ? innerW / (points.length - 1) : 0;
  const x = (index: number) => PAD.left + index * step;
  const y = (value: number) => PAD.top + innerH - (value / yMax) * innerH;
  const barSlot = points.length ? innerW / points.length : 0;
  const barWidth = Math.min(22, barSlot * 0.62);
  const barCenter = (index: number) => PAD.left + index * barSlot + barSlot / 2;
  const pointX = (index: number) => (view === "bars" ? barCenter(index) : x(index));
  const linePath = points.map((point, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)},${y(point.value).toFixed(1)}`).join(" ");
  const areaPath = points.length
    ? `${linePath} L${x(points.length - 1).toFixed(1)},${baseline} L${x(0).toFixed(1)},${baseline} Z`
    : "";
  const hasData = points.some((point) => point.value !== 0);
  const active = hover === null ? null : points[hover];
  const hoverX = hover === null ? null : pointX(hover);
  const hoverY = hover === null || !active ? null : y(active.value);
  const xTickCount = Math.min(5, points.length);
  const xTicks = Array.from({ length: xTickCount }, (_, index) => {
    const pointIndex = xTickCount === 1 ? 0 : Math.round((index * (points.length - 1)) / (xTickCount - 1));
    return { pointIndex, label: points[pointIndex]?.label ?? "" };
  });
  const tooltipX = hoverX === null ? 0 : Math.min(97, Math.max(3, (hoverX / W) * 100));
  const tooltipY = hoverY === null ? 4 : Math.min(78, Math.max(4, (hoverY / H) * 100 - 14));

  function setHoverFromPointer(event: React.PointerEvent<SVGSVGElement>) {
    if (points.length < 2) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const plotX = ((event.clientX - rect.left) / rect.width) * W;
    const index =
      view === "bars"
        ? Math.floor((plotX - PAD.left) / barSlot)
        : Math.round(((plotX - PAD.left) / innerW) * (points.length - 1));
    setHover(Math.min(points.length - 1, Math.max(0, index)));
  }

  return (
    <section
      className={`glass-panel min-w-0 rounded-[18px] p-4 sm:p-5 ${className}`}
      aria-labelledby="activity-chart-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h2 id="activity-chart-title" className="text-sm font-semibold text-ink">Activity</h2>
            <Segmented
              label="Chart metric"
              value={metric.id}
              options={metrics.map((item) => ({ id: item.id, text: item.title }))}
              onChange={(id) => {
                setMetricId(id);
                setHover(null);
              }}
            />
          </div>
          <p className="text-xs text-muted">{metric.title} · Last {range} days</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            label="Date range"
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
            label="Chart style"
            value={view}
            options={[
              { id: "line", text: "Line" },
              { id: "bars", text: "Bars" },
            ]}
            onChange={(id) => {
              setView(id);
              setHover(null);
            }}
          />
        </div>
      </div>

      <p className="mt-4 flex items-baseline gap-2 text-sm text-muted" aria-live="polite">
        <span className="text-[28px] font-semibold tracking-tight text-ink">{format(active ? active.value : total)}</span>
        <span className="text-xs">{active ? active.label : `${metric.title.toLowerCase()} in total`}</span>
      </p>

      <p className="sr-only">
        {metric.title} data for the last {range} days: {points.map((point) => `${point.label}, ${format(point.value)}`).join("; ")}.
      </p>

      <div className="relative mt-2">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block h-auto w-full"
          role="img"
          aria-label={`${metric.title} over the last ${range} days. Total ${format(total)}.`}
          onPointerMove={setHoverFromPointer}
          onPointerDown={setHoverFromPointer}
          onPointerLeave={(event) => {
            if (event.pointerType !== "touch") setHover(null);
          }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-marigold)" stopOpacity="0.35" />
              <stop offset="100%" stopColor="var(--color-marigold)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {[0, 1, 2, 3, 4].map((index) => {
            const value = yMax * (1 - index / 4);
            const gridY = PAD.top + innerH * (index / 4);
            return (
              <g key={index}>
                <line
                  x1={PAD.left}
                  x2={W - PAD.right}
                  y1={gridY}
                  y2={gridY}
                  stroke={index === 4 ? "var(--color-muted)" : "var(--color-line)"}
                  strokeDasharray={index === 4 ? undefined : "4 6"}
                  vectorEffect="non-scaling-stroke"
                />
                <text x={PAD.left - 10} y={gridY + 4} textAnchor="end" fill="var(--color-muted)" fontSize="11">
                  {format(value)}
                </text>
              </g>
            );
          })}

          {points.length > 0 && view === "line" && hasData && (
            <>
              <path d={areaPath} fill={`url(#${gradientId})`} />
              <path
                d={linePath}
                fill="none"
                stroke="var(--color-ink)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
              {points.map((point, index) =>
                point.value > 0 ? (
                  <circle
                    key={`${point.label}-${index}`}
                    cx={x(index)}
                    cy={y(point.value)}
                    r="4"
                    fill="var(--color-marigold)"
                    stroke="var(--color-canvas)"
                    strokeWidth="2"
                    vectorEffect="non-scaling-stroke"
                  />
                ) : null,
              )}
            </>
          )}

          {points.length > 0 && view === "bars" && hasData &&
            points.map((point, index) => {
              const height = Math.max((point.value / yMax) * innerH, point.value > 0 ? 2 : 0);
              return point.value > 0 ? (
                <rect
                  key={`${point.label}-${index}`}
                  x={barCenter(index) - barWidth / 2}
                  y={baseline - height}
                  width={barWidth}
                  height={height}
                  rx="3"
                  fill="var(--color-ink)"
                />
              ) : null;
            })}

          {hover !== null && active && hoverX !== null && (
            <line
              x1={hoverX}
              x2={hoverX}
              y1={PAD.top}
              y2={baseline}
              stroke="var(--color-marigold)"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
          )}
          {view === "line" && hover !== null && active && active.value > 0 && (
            <circle
              cx={x(hover)}
              cy={y(active.value)}
              r="5"
              fill="var(--color-marigold)"
              stroke="var(--color-canvas)"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
          )}

          {xTicks.map((tick, index) => (
            <text
              key={`${tick.pointIndex}-${tick.label}`}
              x={x(tick.pointIndex)}
              y={H - 12}
              textAnchor={index === 0 ? "start" : index === xTicks.length - 1 ? "end" : "middle"}
              fill="var(--color-muted)"
              fontSize="11"
            >
              {tick.label}
            </text>
          ))}
        </svg>

        {!hasData && (
          <p className="pointer-events-none absolute inset-x-14 top-1/2 -translate-y-1/2 text-center text-sm text-muted">
            {metric.emptyMessage}
          </p>
        )}

        {active && hoverX !== null && (
          <div
            role="tooltip"
            className="pointer-events-none absolute z-10 rounded-lg border border-line bg-canvas px-2.5 py-1.5 text-xs font-medium text-ink shadow-lg"
            style={{
              left: `${tooltipX}%`,
              top: `${tooltipY}%`,
              transform: `translate(${tooltipX <= 8 ? "0" : tooltipX >= 92 ? "-100%" : "-50%"}, -100%)`,
            }}
          >
            {active.label}: {format(active.value)}
          </div>
        )}
      </div>
    </section>
  );
}
