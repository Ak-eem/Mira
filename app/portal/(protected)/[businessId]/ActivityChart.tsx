"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { BarChart3, LineChart } from "lucide-react";
import { naira } from "@/lib/site/format";

export type ChartPoint = { label: string; value: number };
// Plain data only (a Server Component passes this in), so the number format is a
// named kind rather than a function.
export type ChartMetric = { id: string; title: string; kind: "count" | "money"; points: ChartPoint[]; emptyMessage: string };

const W = 640;
const H = 160;
const PAD = { top: 12, right: 8, bottom: 24, left: 8 };

const formatters = {
  count: (n: number) => n.toLocaleString("en-NG"),
  money: (n: number) => naira(n),
};

type PlotPoint = { x: number; y: number };

function drawSmoothPolyline(
  ctx: CanvasRenderingContext2D,
  points: PlotPoint[],
  progress: number,
  strokeColor = "#38bdf8",
) {
  if (points.length < 2) return;
  let totalLen = 0;
  const segs: { p0: PlotPoint; p1: PlotPoint; len: number }[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const len = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
    segs.push({ p0: points[i], p1: points[i + 1], len });
    totalLen += len;
  }
  const targetLen = totalLen * Math.max(0, Math.min(progress, 1));
  let acc = 0;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (const s of segs) {
    if (acc + s.len <= targetLen) {
      ctx.lineTo(s.p1.x, s.p1.y);
      acc += s.len;
    } else {
      const t = (targetLen - acc) / s.len;
      ctx.lineTo(s.p0.x + (s.p1.x - s.p0.x) * t, s.p0.y + (s.p1.y - s.p0.y) * t);
      break;
    }
  }
  ctx.lineWidth = 2.5;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = strokeColor;
  ctx.stroke();
}

function ActivityLineCanvas({ points }: { points: PlotPoint[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      console.error("Activity chart could not initialize a 2D canvas context.");
      return;
    }

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const duration = 1100;
    let startTime: number | null = null;
    let frame = 0;

    const draw = (timestamp: number) => {
      const bounds = canvas.getBoundingClientRect();
      const width = Math.max(bounds.width, 1);
      const height = Math.max(bounds.height, 1);
      const pixelRatio = window.devicePixelRatio || 1;
      const pixelWidth = Math.round(width * pixelRatio);
      const pixelHeight = Math.round(height * pixelRatio);

      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }

      ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      ctx.clearRect(0, 0, width, height);
      if (startTime === null) startTime = timestamp;
      const progress = reducedMotion.matches ? 1 : Math.min((timestamp - startTime) / duration, 1);
      const scaledPoints = points.map((point) => ({
        x: (point.x / W) * width,
        y: (point.y / H) * height,
      }));
      const strokeColor = getComputedStyle(canvas).getPropertyValue("--color-ink").trim() || "#0f2a22";
      drawSmoothPolyline(ctx, scaledPoints, progress, strokeColor);

      if (progress < 1) frame = requestAnimationFrame(draw);
    };

    const scheduleDraw = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(draw);
    };
    const resizeObserver = new ResizeObserver(scheduleDraw);
    const onMotionChange = () => {
      startTime = null;
      scheduleDraw();
    };

    resizeObserver.observe(canvas);
    reducedMotion.addEventListener("change", onMotionChange);
    scheduleDraw();

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      reducedMotion.removeEventListener("change", onMotionChange);
    };
  }, [points]);

  return <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none absolute inset-0 z-[1] h-full w-full" />;
}

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
  const index = Math.max(0, options.findIndex((o) => o.id === value));
  return (
    <div role="radiogroup" aria-label={label} className="ui-segmented" style={{ "--n": options.length, "--i": index } as React.CSSProperties}>
      <span aria-hidden className="ui-segmented-thumb" />
      {options.map((option) => (
        <button key={option.id} type="button" role="radio" aria-checked={value === option.id} aria-label={option.aria} onClick={() => onChange(option.id)} className="ui-segment inline-flex items-center justify-center">
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
  const points = useMemo(() => {
    const metricPoints = metric?.points ?? [];
    return range === "7" ? metricPoints.slice(-7) : metricPoints;
  }, [metric?.points, range]);
  const total = points.reduce((sum, p) => sum + p.value, 0);
  const max = Math.max(...points.map((p) => p.value), 1);
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const step = points.length > 1 ? innerW / (points.length - 1) : 0;
  const linePoints = useMemo(
    () => points.map((point, index) => ({
      x: PAD.left + index * step,
      y: PAD.top + innerH - (point.value / max) * innerH,
    })),
    [points, step, innerH, max],
  );
  if (!metric) return null;
  const format = formatters[metric.kind];
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
          {view === "line" && (
            <ActivityLineCanvas key={`${metric.id}-${range}`} points={linePoints} />
          )}
          {view === "line" && hover !== null && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute z-[2] border-l border-ink/25"
              style={{
                left: `${(x(hover) / W) * 100}%`,
                top: `${(PAD.top / H) * 100}%`,
                bottom: `${(PAD.bottom / H) * 100}%`,
              }}
            />
          )}
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
