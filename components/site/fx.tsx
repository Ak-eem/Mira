'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { cx } from '@/lib/site/format'
import { Icon, type IconName } from './icons'

/** Counts up to `value` once, when it mounts (~900ms, ease-out). */
export function CountUp({ value, format = (n) => Math.round(n).toLocaleString('en-NG'), duration = 900 }: { value: number; format?: (n: number) => string; duration?: number }) {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const raf = requestAnimationFrame(() => setN(value))
      return () => cancelAnimationFrame(raf)
    }
    const start = performance.now()
    let raf = 0
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration)
      setN(value * (1 - Math.pow(1 - p, 3)))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, duration])
  return <>{format(n)}</>
}

/** Tiny line that draws itself in. */
export function Sparkline({ data, className = 'h-8 w-20' }: { data: number[]; className?: string }) {
  const max = Math.max(...data)
  const min = Math.min(...data)
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * 100},${30 - ((v - min) / (max - min || 1)) * 26 - 2}`).join(' ')
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className={cx('reveal-x', className)} aria-hidden="true">
      <polyline points={`0,30 ${pts} 100,30`} fill="var(--color-lime-2)" opacity="0.45" />
      <polyline points={pts} fill="none" stroke="var(--color-ink)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

/**
 * Area chart that draws itself in and reads out the day under the cursor
 * (or finger). SVG + a few absolutely positioned bits; no chart library.
 */
export function LiveChart({ data, label = (i: number) => `Day ${i + 1}`, unit = '', height = 200 }: { data: number[]; label?: (i: number) => string; unit?: string; height?: number }) {
  const id = useId()
  const box = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState<number | null>(null)
  const max = Math.max(...data) * 1.12
  const x = (i: number) => (i / (data.length - 1)) * 100
  const y = (v: number) => 100 - (v / max) * 100
  const line = data.reduce((d, v, i) => {
    if (i === 0) return `M0,${y(v)}`
    const px = x(i - 1)
    const mid = px + (x(i) - px) / 2
    return `${d} C${mid},${y(data[i - 1])} ${mid},${y(v)} ${x(i)},${y(v)}`
  }, '')

  const pick = (clientX: number) => {
    const r = box.current?.getBoundingClientRect()
    if (!r) return
    setAt(Math.round(Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * (data.length - 1)))
  }

  const show = at ?? data.length - 1
  return (
    <div
      ref={box}
      className="relative touch-pan-y select-none"
      style={{ height }}
      onPointerMove={(e) => pick(e.clientX)}
      onPointerDown={(e) => pick(e.clientX)}
      onPointerLeave={() => setAt(null)}
    >
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="reveal-x absolute inset-0 h-full w-full" role="img" aria-label="Chart">
        <defs>
          <linearGradient id={`g${id}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--color-lime-2)" stopOpacity="0.8" />
            <stop offset="100%" stopColor="var(--color-lime-2)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[25, 50, 75].map((g) => (
          <line key={g} x1="0" x2="100" y1={g} y2={g} stroke="var(--color-ink)" strokeOpacity="0.07" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
        ))}
        <path d={`${line} L100,100 L0,100 Z`} fill={`url(#g${id})`} />
        <path d={line} fill="none" stroke="var(--color-ink)" strokeWidth="2.2" vectorEffect="non-scaling-stroke" />
      </svg>
      {/* crosshair + readout */}
      <span className="pointer-events-none absolute top-0 bottom-0 w-px bg-ink/15 transition-[left] duration-150" style={{ left: `${x(show)}%` }} />
      <span
        className="pointer-events-none absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white bg-ink shadow-float transition-[left,top] duration-150"
        style={{ left: `${x(show)}%`, top: `${y(data[show])}%` }}
      />
      <span
        className="glass-strong pointer-events-none absolute -translate-y-[calc(100%+14px)] rounded-[14px] px-3 py-2 text-left transition-[left,top] duration-150"
        style={{ left: `clamp(0px, calc(${x(show)}% - 52px), calc(100% - 104px))`, top: `${y(data[show])}%` }}
      >
        <span className="block text-[11px] text-muted">{label(show)}</span>
        <span className="block text-[15px] font-medium tabular-nums">
          {data[show]}
          {unit}
        </span>
      </span>
    </div>
  )
}

/** Circular gauge that fills on mount. */
export function Gauge({ value, size = 120, label }: { value: number; size?: number; label?: string }) {
  const r = size / 2 - 8
  const c = 2 * Math.PI * r
  const [v, setV] = useState(0)
  useEffect(() => {
    const t = setTimeout(() => setV(value), 80)
    return () => clearTimeout(t)
  }, [value])
  return (
    <span className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-lime)" strokeWidth="10" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-ink)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={`${c * v} ${c}`}
          style={{ transition: 'stroke-dasharray 1000ms var(--ease-out)' }}
        />
      </svg>
      <span className="absolute flex flex-col items-center">
        <span className="text-[26px] leading-none font-medium tabular-nums">
          <CountUp value={value * 100} format={(n) => `${Math.round(n)}%`} />
        </span>
        {label && <span className="mt-1 text-[11px] text-muted">{label}</span>}
      </span>
    </span>
  )
}

/** The assistant "breathing": an orb with rings rippling out. */
export function LivePulse({ className }: { className?: string }) {
  return (
    <span className={cx('relative grid place-items-center', className)} aria-hidden="true">
      <span className="pulse-ring absolute inset-0 rounded-full bg-lime-2/60" />
      <span className="pulse-ring absolute inset-0 rounded-full bg-lime-2/50" style={{ animationDelay: '1.2s' }} />
      <span
        className="relative size-full rounded-full"
        style={{
          background: 'radial-gradient(circle at 32% 28%, #fff 0%, #f7fbd9 40%, #f6d56b 80%, #c5dc45 100%)',
          boxShadow: 'inset -8px -10px 22px rgb(120 140 20 / 0.25), inset 6px 8px 16px rgb(255 255 255 / 0.9), 0 18px 40px -16px rgb(150 170 30 / 0.7)',
        }}
      />
    </span>
  )
}

/* ---------- Live activity: sample events arriving every few seconds ---------- */

type Activity = { id: number; icon: IconName; title: string; meta: string; tone: 'ink' | 'lime' | 'mist' }

const POOL: Omit<Activity, 'id'>[] = [
  { icon: 'chat', title: 'Answered “Do you have this in size 14?”', meta: 'Website chat · Ankara Wrap Dress', tone: 'lime' },
  { icon: 'cart', title: 'New order · ₦38,000', meta: 'Indigo Adire Kaftan · Website chat', tone: 'ink' },
  { icon: 'truck', title: 'MRA-2037 marked shipped', meta: 'Customer told in chat', tone: 'mist' },
  { icon: 'chat', title: 'Answered “How much is delivery to Abuja?”', meta: 'WhatsApp · from your FAQs', tone: 'lime' },
  { icon: 'user', title: 'Handed to you: restock question', meta: 'Aso-Oke Clutch · Visitor 4821', tone: 'mist' },
  { icon: 'cart', title: 'New order · ₦62,000', meta: 'Tie-Dye Two-Piece × 2 · Instagram', tone: 'ink' },
  { icon: 'tag', title: 'Promo DETTY15 used', meta: '15% off · Website chat', tone: 'lime' },
  { icon: 'chat', title: 'Answered “Are you open on Sunday?”', meta: 'Website chat · from your hours', tone: 'lime' },
]

export function LiveFeed({ every = 3800, size = 5 }: { every?: number; size?: number }) {
  const n = useRef(size)
  const [items, setItems] = useState<Activity[]>(() => POOL.slice(0, size).map((a, i) => ({ ...a, id: i })))
  const [ages, setAges] = useState<number[]>(() => items.map((_, i) => 1 + i * 3))

  useEffect(() => {
    const t = setInterval(() => {
      const id = n.current++
      setItems((xs) => [{ ...POOL[id % POOL.length], id }, ...xs].slice(0, size))
      setAges((as) => [0, ...as.map((a) => a + 1)].slice(0, size))
    }, every)
    return () => clearInterval(t)
  }, [every, size])

  return (
    <ul className="flex flex-col gap-2">
      {items.map((a, i) => (
        <li key={a.id} className="flex items-center gap-3 rounded-[18px] bg-white/55 p-2.5 pr-3.5 animate-pop">
          <span className={cx('grid size-9 shrink-0 place-items-center rounded-full', a.tone === 'ink' ? 'bg-ink text-white' : a.tone === 'lime' ? 'bg-lime-2' : 'bg-mist')}>
            <Icon name={a.icon} size={16} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium">{a.title}</span>
            <span className="block truncate text-xs text-muted">{a.meta}</span>
          </span>
          <span className="shrink-0 text-[11px] text-muted tabular-nums">{ages[i] === 0 ? 'now' : `${ages[i]}m`}</span>
        </li>
      ))}
    </ul>
  )
}
