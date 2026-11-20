"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { RubberSegment } from "@/components/ui/RubberSegment";
import { naira } from "@/lib/site/format";

// One point per day, oldest first, zero-filled. `t` is the start of that day; `parts` splits the
// day by channel for metrics that have one (conversations).
export type ChartPoint = { t: number; value: number; parts?: Record<string, number> };
export type ChartChannel = { id: string; label: string };
// Plain data only (a Server Component passes this in), so the number format is a named kind
// rather than a function. `points` holds at least twice the longest range so the previous
// period can be compared.
export type ChartMetric = {
  id: string;
  title: string;
  kind: "count" | "money";
  points: ChartPoint[];
  emptyMessage: string;
  channels?: ChartChannel[];
};

const TZ = "Africa/Lagos";
const dayFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" });
const shortFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "numeric", month: "short" });

const RANGES = ["7", "30", "90"] as const;
type Range = (typeof RANGES)[number];

// Fixed order, so a channel keeps its colour whichever others have data.
const CHANNEL_COLOR: Record<string, string> = {
  web: "var(--color-chart-web)",
  whatsapp: "var(--color-chart-whatsapp)",
  email: "var(--color-chart-email)",
};
const channelColor = (id: string) => CHANNEL_COLOR[id] ?? "var(--color-muted)";

const formatters = {
  count: (n: number) => Math.round(n).toLocaleString("en-NG"),
  money: (n: number) => naira(n),
};
const axisFormatters = {
  count: (n: number) => n.toLocaleString("en-NG"),
  money: (n: number) => (n >= 1e6 ? `₦${+(n / 1e6).toFixed(1)}M` : n >= 1000 ? `₦${+(n / 1000).toFixed(n % 1000 ? 1 : 0)}K` : `₦${n}`),
};

function niceScale(max: number, integer: boolean) {
  if (max <= 0) return { top: 1, ticks: [0, 1] };
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  let step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  if (integer && step < 1) step = 1;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(v);
  return { top, ticks };
}

function roundTop(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

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

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marigold ${checked ? "border-ink text-ink" : "border-line text-ink-2 hover:text-ink"}`}
    >
      <span aria-hidden className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${checked ? "bg-ink" : "bg-line"}`}>
        <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-surface transition-all ${checked ? "left-3.5" : "left-0.5"}`} />
      </span>
      {label}
    </button>
  );
}

const M = { top: 14, right: 12, bottom: 28 };

// One card, one or two metrics (conversations, sales), over the last 7, 30 or 90 days as a
// line or bars. Conversations can be split by channel. The previous period is hidden until
// "Compare with previous period" is switched on (line view). The line draws itself and the
// bars grow on every change; both are switched off for people who prefer reduced motion.
export function ActivityPanel({ metrics, className = "" }: { metrics: ChartMetric[]; className?: string }) {
  const [metricId, setMetricId] = useState(metrics[0]?.id ?? "");
  const [view, setView] = useState<"line" | "bars">("line");
  const [range, setRange] = useState<Range>("30");
  const [split, setSplit] = useState(false);
  const [compare, setCompare] = useState(false);
  const [table, setTable] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const [width, setWidth] = useState(640);
  const boxRef = useRef<HTMLDivElement>(null);
  const tipId = useId();

  useEffect(() => {
    const node = boxRef.current;
    if (!node || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => {
      const next = Math.round(node.clientWidth);
      if (next > 0) setWidth((current) => (Math.abs(current - next) > 1 ? next : current));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [table]);

  const metric = metrics.find((m) => m.id === metricId) ?? metrics[0];
  if (!metric) return null;

  const format = formatters[metric.kind];
  const axisFormat = axisFormatters[metric.kind];
  const channels = metric.channels ?? [];
  const canSplit = channels.length > 0;
  const splitting = split && canSplit;
  const comparing = compare && view === "line" && !splitting;
  // Three overlapping lines are unreadable for small businesses, so a channel split is always stacked bars.
  const shape = splitting ? "bars" : view;

  const days = Number(range);
  const cur = metric.points.slice(-days);
  const prev = metric.points.slice(-days * 2, -days);
  const total = cur.reduce((s, p) => s + p.value, 0);
  const before = prev.reduce((s, p) => s + p.value, 0);
  const pct = before === 0 ? null : Math.round(((total - before) / before) * 100);
  let best = 0;
  cur.forEach((p, i) => {
    if (p.value > cur[best].value) best = i;
  });

  // ---- geometry
  const n = cur.length;
  const H = width < 480 ? 220 : 270;
  const left = metric.kind === "money" ? 52 : 38;
  const iw = Math.max(1, width - left - M.right);
  const ih = H - M.top - M.bottom;
  let maxVal = 0;
  for (const p of cur) maxVal = Math.max(maxVal, p.value);
  if (comparing) for (const p of prev) maxVal = Math.max(maxVal, p.value);
  const scale = niceScale(maxVal, metric.kind === "count");
  const y = (v: number) => M.top + ih - (v / scale.top) * ih;
  const slot = iw / Math.max(n, 1);
  const xLine = (i: number) => left + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
  const xBar = (i: number) => left + slot * (i + 0.5);
  const xAt = shape === "bars" ? xBar : xLine;
  const pathOf = (values: number[]) => values.map((v, i) => `${i ? "L" : "M"}${xLine(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");

  const wantTicks = width < 480 ? 4 : 6;
  const stepX = Math.max(1, Math.round((n - 1) / (wantTicks - 1)));
  const xTicks: number[] = [];
  for (let i = 0; i < n; i += stepX) if (n - 1 - i >= stepX * 0.5 || i === 0) xTicks.push(i);

  function indexFromEvent(event: React.PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * width;
    const i = shape === "bars" ? Math.floor((px - left) / slot) : Math.round(((px - left) / iw) * (n - 1));
    return Math.min(n - 1, Math.max(0, i));
  }
  function onKey(event: React.KeyboardEvent<SVGSVGElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const at = hover ?? n - 1;
    setHover(event.key === "ArrowLeft" ? Math.max(0, at - 1) : event.key === "ArrowRight" ? Math.min(n - 1, at + 1) : event.key === "Home" ? 0 : n - 1);
  }

  const active = hover !== null ? cur[hover] : null;
  const activePrev = hover !== null ? prev[hover] : undefined;
  const hoverX = hover !== null ? xAt(hover) : 0;
  const hoverTop = active ? y(splitting ? Math.max(...channels.map((c) => active.parts?.[c.id] ?? 0)) : active.value) : 0;
  // Estimated tooltip size (it never grows past its max width); only used to keep it inside the card.
  const tipWidth = 190;
  const tipHeight = splitting ? 118 : comparing ? 106 : 58;
  const tipLeft = hoverX + 14 + tipWidth > width ? Math.max(0, hoverX - tipWidth - 14) : hoverX + 14;
  const tipTop = Math.max(0, hoverTop - tipHeight - 12);

  const pillClass = pct === null ? (total > 0 ? "bg-lime text-ink" : "bg-mist text-muted") : pct > 0 ? "bg-lime text-ink" : pct < 0 ? "bg-danger/10 text-danger" : "bg-mist text-muted";
  const pillText = pct === null ? (total > 0 ? "New" : "No change") : pct > 0 ? `+${pct}%` : pct < 0 ? `${pct}%` : "No change";

  return (
    <section className={`glass-panel min-w-0 rounded-[18px] p-5 sm:p-6 ${className}`} aria-label="Activity">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
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
          <h2 className="text-sm font-semibold text-ink">{metric.title}</h2>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Segmented
            label="Range"
            value={range}
            options={RANGES.map((r) => ({ id: r, text: `${r}d` }))}
            onChange={(id) => {
              setRange(id);
              setHover(null);
            }}
          />
          {splitting ? null : (
            <Segmented
              label="Chart type"
              value={view}
              options={[
                { id: "line" as const, text: "Line" },
                { id: "bars" as const, text: "Bars" },
              ]}
              onChange={(id) => {
                setView(id);
                setHover(null);
              }}
            />
          )}
        </div>
      </div>

      <div className="mt-7 flex flex-wrap items-center gap-x-3 gap-y-1" aria-live="polite">
        <span className="text-4xl font-semibold tracking-tight text-ink tabular-nums">{format(total)}</span>
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ${pillClass}`}>
          {pct !== null && pct > 0 ? <ArrowUp className="h-3 w-3" aria-hidden="true" /> : pct !== null && pct < 0 ? <ArrowDown className="h-3 w-3" aria-hidden="true" /> : null}
          {pillText}
        </span>
        <span className="text-xs text-muted">last {range} days</span>
      </div>

      {total === 0 ? (
        <div className="mt-6 flex h-[200px] items-center justify-center rounded-xl border border-dashed border-line text-center text-sm text-muted">
          <p className="max-w-xs px-4">{metric.emptyMessage}</p>
        </div>
      ) : (
        <>
          <div className="mt-7 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
            <ul className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-2">
              {splitting ? (
                channels.map((c) => (
                  <li key={c.id} className="inline-flex items-center gap-2">
                    <span aria-hidden className="h-2 w-2 rounded-sm" style={{ background: channelColor(c.id) }} />
                    {c.label}
                  </li>
                ))
              ) : comparing ? (
                <>
                  <li className="inline-flex items-center gap-2">
                    <span aria-hidden className="h-0 w-4 rounded-full border-t-2 border-ink" />
                    Now
                  </li>
                  <li className="inline-flex items-center gap-2">
                    <span aria-hidden className="h-0 w-4 border-t-2 border-dashed border-muted" />
                    Before
                  </li>
                </>
              ) : null}
            </ul>
            <div className="flex flex-wrap items-center gap-2">
              {canSplit ? <Toggle label="By channel" checked={splitting} onChange={(next) => { setSplit(next); setHover(null); }} /> : null}
              {view === "line" && !splitting ? <Toggle label="Compare" checked={compare} onChange={setCompare} /> : null}
            </div>
          </div>

          {table ? (
            <div className="mt-3 max-h-80 overflow-auto rounded-xl border border-line">
              <table className="w-full border-collapse text-sm tabular-nums">
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th className="sticky top-0 bg-surface px-3 py-2 font-medium">Date</th>
                    {splitting ? channels.map((c) => <th key={c.id} className="sticky top-0 bg-surface px-3 py-2 text-right font-medium">{c.label}</th>) : null}
                    <th className="sticky top-0 bg-surface px-3 py-2 text-right font-medium">{splitting ? "Total" : metric.title}</th>
                    {!splitting ? <th className="sticky top-0 bg-surface px-3 py-2 text-right font-medium">Previous period</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {cur.map((p, i) => ({ p, i })).reverse().map(({ p, i }) => (
                    <tr key={p.t} className="border-t border-line">
                      <td className="whitespace-nowrap px-3 py-2 text-ink-2">{dayFmt.format(p.t)}</td>
                      {splitting ? channels.map((c) => <td key={c.id} className="px-3 py-2 text-right">{format(p.parts?.[c.id] ?? 0)}</td>) : null}
                      <td className="px-3 py-2 text-right font-medium text-ink">{format(p.value)}</td>
                      {!splitting ? <td className="px-3 py-2 text-right text-muted">{prev[i] ? format(prev[i].value) : "-"}</td> : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div ref={boxRef} className="relative mt-2">
              {/* key replays the animation whenever the metric, range, type or split changes */}
              <svg
                key={`${metric.id}-${view}-${range}-${splitting}`}
                viewBox={`0 0 ${width} ${H}`}
                width={width}
                height={H}
                className="block w-full touch-pan-y outline-none focus-visible:ring-2 focus-visible:ring-marigold"
                role="img"
                tabIndex={0}
                aria-label={`${metric.title}: ${format(total)} in the last ${range} days. Use the left and right arrow keys to read each day.`}
                aria-describedby={hover !== null ? tipId : undefined}
                onPointerMove={(event) => setHover(indexFromEvent(event))}
                onPointerDown={(event) => setHover(indexFromEvent(event))}
                onPointerLeave={() => setHover(null)}
                onBlur={() => setHover(null)}
                onKeyDown={onKey}
              >
                {scale.ticks.map((tv) => (
                  <g key={tv}>
                    <line x1={left} x2={width - M.right} y1={Math.round(y(tv)) + 0.5} y2={Math.round(y(tv)) + 0.5} stroke="var(--color-line)" strokeOpacity={tv === 0 ? 1 : 0.7} />
                    <text x={left - 8} y={Math.round(y(tv)) + 4.5} textAnchor="end" fontSize={11} fill="var(--color-muted)">
                      {axisFormat(tv)}
                    </text>
                  </g>
                ))}
                {xTicks.map((i) => (
                  <text key={i} x={xAt(i)} y={H - 8} textAnchor={i === 0 && shape === "line" ? "start" : "middle"} fontSize={11} fill="var(--color-muted)">
                    {shortFmt.format(cur[i].t)}
                  </text>
                ))}

                {shape === "line" ? (
                  (
                    <>
                      {comparing ? <path d={pathOf(prev.map((p) => p.value))} fill="none" stroke="var(--color-muted)" strokeOpacity={0.8} strokeWidth={1.5} strokeDasharray="4 4" strokeLinecap="round" strokeLinejoin="round" /> : null}
                      <path d={`${pathOf(cur.map((p) => p.value))} L${xLine(n - 1).toFixed(1)},${y(0)} L${xLine(0).toFixed(1)},${y(0)} Z`} fill="var(--color-ink)" fillOpacity={0.08} className="animate-area motion-reduce:animate-none" />
                      <path d={pathOf(cur.map((p) => p.value))} pathLength={1} strokeDasharray={1} strokeDashoffset={0} fill="none" stroke="var(--color-ink)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="animate-draw motion-reduce:animate-none" />
                      <circle cx={xLine(n - 1)} cy={y(cur[n - 1].value)} r={6} fill="var(--color-surface)" />
                      <circle cx={xLine(n - 1)} cy={y(cur[n - 1].value)} r={4} fill="var(--color-ink)" />
                      <circle cx={xLine(best)} cy={y(cur[best].value)} r={6} fill="var(--color-surface)" />
                      <circle cx={xLine(best)} cy={y(cur[best].value)} r={4} fill="var(--color-marigold)" />
                      <text
                        x={xLine(best)}
                        y={y(cur[best].value) < M.top + 20 ? y(cur[best].value) + 20 : y(cur[best].value) - 12}
                        textAnchor={xLine(best) > width * 0.72 ? "end" : xLine(best) < width * 0.12 ? "start" : "middle"}
                        fontSize={11}
                        fontWeight={600}
                        fill="var(--color-ink)"
                      >
                        Best: {format(cur[best].value)}
                      </text>
                    </>
                  )
                ) : (
                  cur.map((p, i) => {
                    const bw = Math.min(24, slot * 0.68);
                    const bx = xBar(i) - bw / 2;
                    const delay = { animationDelay: `${Math.min(i * 8, 260)}ms` };
                    const cls = "origin-bottom animate-grow [transform-box:fill-box] motion-reduce:animate-none";
                    if (!splitting) {
                      const h = Math.max((p.value / scale.top) * ih, p.value > 0 ? 2 : 0);
                      return h > 0 ? <path key={p.t} d={roundTop(bx, y(0) - h, bw, h, 4)} fill={hover === i ? "var(--color-marigold)" : "var(--color-ink)"} className={cls} style={delay} /> : null;
                    }
                    let acc = 0;
                    const present = channels.filter((c) => (p.parts?.[c.id] ?? 0) > 0);
                    return (
                      <g key={p.t}>
                        {present.map((c, k) => {
                          const h = ((p.parts?.[c.id] ?? 0) / scale.top) * ih;
                          const top = y(0) - acc - h;
                          const gap = k > 0 ? 2 : 0; // surface gap between stacked segments
                          const hh = Math.max(h - gap, 1);
                          acc += h;
                          const isTop = k === present.length - 1;
                          return <path key={c.id} d={isTop ? roundTop(bx, top, bw, hh, 3) : `M${bx},${top + gap}h${bw}v${hh}h${-bw}z`} fill={channelColor(c.id)} className={cls} style={delay} />;
                        })}
                      </g>
                    );
                  })
                )}

                {hover !== null && active ? (
                  <g pointerEvents="none">
                    <line x1={hoverX} x2={hoverX} y1={M.top} y2={M.top + ih} stroke="var(--color-ink)" strokeOpacity={0.3} />
                    {shape === "line" ? (
                      <>
                        <circle cx={hoverX} cy={y(active.value)} r={6} fill="var(--color-surface)" />
                        <circle cx={hoverX} cy={y(active.value)} r={4} fill="var(--color-ink)" />
                      </>
                    ) : null}
                  </g>
                ) : null}
              </svg>

              <div
                id={tipId}
                role="status"
                className={`pointer-events-none absolute z-10 min-w-[150px] max-w-[220px] rounded-xl border border-line bg-surface px-3 py-2 text-xs text-ink shadow-[0_12px_28px_-12px_rgb(15_42_34/0.45)] transition-opacity duration-100 ${hover !== null ? "opacity-100" : "opacity-0"}`}
                style={{ left: tipLeft, top: tipTop }}
              >
                {active ? (
                  <>
                    <p className="text-ink-2">{dayFmt.format(active.t)}</p>
                    {splitting ? (
                      <div className="mt-1 space-y-0.5">
                        {channels.map((c) => (
                          <p key={c.id} className="flex items-center justify-between gap-3">
                            <span className="inline-flex items-center gap-1.5 text-ink-2">
                              <span aria-hidden className="h-0 w-3 rounded-full border-t-2" style={{ borderColor: channelColor(c.id) }} />
                              {c.label}
                            </span>
                            <span className="font-semibold tabular-nums">{format(active.parts?.[c.id] ?? 0)}</span>
                          </p>
                        ))}
                        <p className="flex items-center justify-between gap-3 border-t border-line pt-1">
                          <span className="text-ink-2">All channels</span>
                          <span className="font-semibold tabular-nums">{format(active.value)}</span>
                        </p>
                      </div>
                    ) : (
                      <div className="mt-1 space-y-0.5">
                        <p className="flex items-center justify-between gap-3">
                          <span className="text-ink-2">{metric.title}</span>
                          <span className="text-sm font-semibold tabular-nums">{format(active.value)}</span>
                        </p>
                        {comparing && activePrev ? (
                          <>
                            <p className="flex items-center justify-between gap-3">
                              <span className="inline-flex items-center gap-1.5 text-ink-2">
                                <span aria-hidden className="h-0 w-3 border-t-2 border-dashed border-muted" />
                                Previous
                              </span>
                              <span className="font-semibold tabular-nums">{format(activePrev.value)}</span>
                            </p>
                            <p className="pt-1 text-ink-2">
                              {active.value === activePrev.value ? "Same as " : `${active.value > activePrev.value ? "Up" : "Down"} ${format(Math.abs(active.value - activePrev.value))} on `}
                              {dayFmt.format(activePrev.t)}
                            </p>
                          </>
                        ) : null}
                      </div>
                    )}
                  </>
                ) : null}
              </div>
            </div>
          )}

          <div className="mt-2 flex justify-end">
            <button type="button" onClick={() => { setTable((t) => !t); setHover(null); }} className="text-xs text-ink-2 underline underline-offset-4 hover:text-ink">
              {table ? "View as chart" : "View as table"}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
