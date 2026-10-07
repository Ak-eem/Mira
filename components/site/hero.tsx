'use client'

import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import GlassSurface from './GlassSurface'
import { naira } from '@/lib/site/format'
import { ChatPanel, useChat } from './chat'
import { Icon, type IconName } from './icons'
import { Badge, Button, ProductImage } from './ui'

/* ---------- Aurora: soft colour fields that give the glass something to frost ---------- */

export function Aurora({ className = '', intensity = 1, fade = true }: { className?: string; intensity?: number; fade?: boolean }) {
  const mask = fade ? 'linear-gradient(transparent, #000 18%, #000 82%, transparent)' : undefined
  // Radial gradients (no blur filter) keep this cheap on low-end phones.
  const blob = (style: CSSProperties, anim: string) => <span aria-hidden="true" className={`absolute rounded-full will-change-transform ${anim}`} style={style} />
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
      style={{ opacity: intensity, maskImage: mask, WebkitMaskImage: mask }}
    >
      {blob({ width: '62vw', height: '62vw', left: '-14vw', top: '-18vw', background: 'radial-gradient(closest-side, rgb(241 223 160 / 0.75), rgb(241 223 160 / 0) 100%)' }, 'aurora-a')}
      {blob({ width: '56vw', height: '56vw', right: '-16vw', top: '-6vw', background: 'radial-gradient(closest-side, rgb(207 220 203 / 0.9), rgb(207 220 203 / 0) 100%)' }, 'aurora-b')}
      {blob({ width: '48vw', height: '48vw', left: '24vw', top: '30vw', background: 'radial-gradient(closest-side, rgb(251 240 204 / 0.95), rgb(251 240 204 / 0) 100%)' }, 'aurora-c')}
      {blob({ width: '40vw', height: '40vw', right: '4vw', top: '46vw', background: 'radial-gradient(closest-side, rgb(228 219 200 / 0.8), rgb(228 219 200 / 0) 100%)' }, 'aurora-a')}
    </div>
  )
}

/* ---------- The phone ---------- */

function StatusBar() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex h-[46px] items-center justify-between px-[26px] pt-1 text-[14px] font-semibold text-ink">
      <span className="w-14 tabular-nums">9:41</span>
      <span className="flex w-14 items-center justify-end gap-1.5">
        <svg width="17" height="11" viewBox="0 0 17 11" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <rect key={i} x={i * 4.5} y={8 - i * 2.6} width="3" height={3 + i * 2.6} rx="1" fill="currentColor" />
          ))}
        </svg>
        <svg width="15" height="11" viewBox="0 0 15 11" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <path d="M1.5 4a9 9 0 0 1 12 0M3.8 6.4a5.6 5.6 0 0 1 7.4 0" />
          <circle cx="7.5" cy="9" r="1" fill="currentColor" stroke="none" />
        </svg>
        <svg width="25" height="12" viewBox="0 0 25 12" aria-hidden="true">
          <rect x="0.5" y="0.5" width="21" height="11" rx="3.5" fill="none" stroke="currentColor" opacity="0.4" />
          <rect x="2" y="2" width="16" height="8" rx="2" fill="currentColor" />
          <path d="M23 4v4a2 2 0 0 0 0-4Z" fill="currentColor" opacity="0.4" />
        </svg>
      </span>
    </div>
  )
}

/**
 * A large flagship phone drawn in CSS: brushed frame, side buttons, the
 * island, status bar and home indicator. `children` is the live screen.
 */
export function Phone({ children, className = '' }: { children: ReactNode; className?: string }) {
  const frame = 'linear-gradient(145deg, #f3f1ec 0%, #a8a49c 18%, #e9e6e0 34%, #8d8981 52%, #d8d5ce 72%, #77736c 100%)'
  const button = (style: CSSProperties) => <span aria-hidden="true" className="absolute w-[4px] rounded-[2px]" style={{ background: frame, ...style }} />
  return (
    <div className={`relative aspect-[9/19.5] w-[var(--pw)] ${className}`}>
      {/* side buttons */}
      {button({ left: -3, top: '17%', height: '4%' })}
      {button({ left: -3, top: '24%', height: '7.5%' })}
      {button({ left: -3, top: '33%', height: '7.5%' })}
      {button({ right: -3, top: '27%', height: '11%' })}
      {button({ right: -3, top: '55%', height: '6%' })}
      {/* frame */}
      <div className="absolute inset-0 rounded-[calc(var(--pw)*0.165)] p-[3px] shadow-[0_60px_120px_-40px_rgb(17_17_18/0.55),0_30px_60px_-30px_rgb(17_17_18/0.35)]" style={{ background: frame }}>
        {/* bezel */}
        <div className="h-full w-full rounded-[calc(var(--pw)*0.165-3px)] bg-[#0b0b0c] p-[calc(var(--pw)*0.026)]">
          {/* screen */}
          <div className="relative h-full w-full overflow-hidden rounded-[calc(var(--pw)*0.14)] bg-surface [transform:translateZ(0)]">
            <span aria-hidden="true" className="absolute top-[11px] left-1/2 z-40 h-[33px] w-[32%] -translate-x-1/2 rounded-pill bg-black" />
            <StatusBar />
            {children}
            <span aria-hidden="true" className="pointer-events-none absolute bottom-[7px] left-1/2 z-40 h-[5px] w-[36%] -translate-x-1/2 rounded-pill bg-ink/85" />
          </div>
        </div>
      </div>
      {/* glass glare */}
      <span aria-hidden="true" className="pointer-events-none absolute inset-[3px] rounded-[calc(var(--pw)*0.16)] bg-[linear-gradient(115deg,rgb(255_255_255/0.22)_0%,rgb(255_255_255/0)_32%,rgb(255_255_255/0)_70%,rgb(255_255_255/0.08)_100%)]" />
    </div>
  )
}

/** What's on the phone: the store's own site, with Mira open on top as frosted glass. */
function StoreScreen() {
  const chat = useChat({ inviteAfter: 3 })
  return (
    <div className="absolute inset-0">
      {/* The store's site underneath */}
      <div className="absolute inset-0 bg-[#f6f3ec]">
        <div className="flex items-center justify-between px-5 pt-[56px] text-[13px]">
          <span className="font-semibold tracking-[0.18em] uppercase">Adire Lane</span>
          <Icon name="menu" size={18} />
        </div>
        <div className="relative mx-4 mt-4 h-[46%] overflow-hidden rounded-[24px]">
          <ProductImage name="New in" tint="lime" className="absolute inset-0" />
          <span className="absolute -right-6 -bottom-10 size-48 rounded-full bg-[radial-gradient(circle_at_30%_30%,#fff,#e8e2d4_60%,#d7cfbd)] shadow-[inset_-10px_-14px_30px_rgb(0_0_0/0.08)]" />
          <span className="absolute top-5 left-5 text-[22px] leading-tight font-medium tracking-tight">
            New in:
            <br />
            indigo adire
          </span>
        </div>
        <div className="mx-4 mt-3 grid grid-cols-2 gap-2.5">
          <ProductImage name="Kaftan" tint="sand" className="h-24 rounded-[18px]" />
          <ProductImage name="Wrap dress" tint="mist" className="h-24 rounded-[18px]" />
        </div>
      </div>
      {/* Mira, as a frosted sheet over the store */}
      <div className="glass-strong absolute inset-x-[6px] top-[118px] bottom-[6px] flex flex-col overflow-hidden rounded-[30px] pb-3">
        <ChatPanel chat={chat} />
      </div>
    </div>
  )
}

/* ---------- Floating glass cards around the phone ---------- */

function FloatCard({ depth, className, children, delay = 0 }: { depth: number; className: string; children: ReactNode; delay?: number }) {
  return (
    <div
      className={`absolute z-20 ${className}`}
      style={{ transform: `translate3d(calc(var(--mx, 0) * ${depth * 26}px), calc(var(--my, 0) * ${depth * 18}px), 0)`, transition: 'transform 600ms var(--ease-out)' }}
    >
      <div className="animate-pop" style={{ animationDelay: `${delay}ms` }}>
        <div className="float-bob glass-strong rounded-[22px] p-3 shadow-float" style={{ animationDelay: `${-delay * 3}ms` }}>
          {children}
        </div>
      </div>
    </div>
  )
}

function MiniRing({ value }: { value: number }) {
  const r = 18
  const c = 2 * Math.PI * r
  return (
    <span className="relative grid size-11 shrink-0 place-items-center">
      <svg width="44" height="44" className="-rotate-90">
        <circle cx="22" cy="22" r={r} fill="none" stroke="var(--color-lime)" strokeWidth="4" />
        <circle cx="22" cy="22" r={r} fill="none" stroke="var(--color-ink)" strokeWidth="2" strokeDasharray={`${c * value} ${c}`} strokeLinecap="round" />
      </svg>
      <span className="absolute text-[11px] font-semibold tabular-nums">{Math.round(value * 100)}%</span>
    </span>
  )
}

function IconDot({ name, dark }: { name: IconName; dark?: boolean }) {
  return (
    <span className={`grid size-9 shrink-0 place-items-center rounded-full ${dark ? 'bg-ink text-white' : 'bg-lime-2 text-ink'}`}>
      <Icon name={name} size={16} />
    </span>
  )
}

/* ---------- Hero ---------- */

const WORDS = ['Every', 'customer', 'question,', '#icons', 'answered', 'with', 'confidence.']

export function Hero({ price = 50000 }: { price?: number }) {
  const stage = useRef<HTMLDivElement>(null)
  const tilt = useRef<HTMLDivElement>(null)

  // Scroll stands the phone up (transform only); the pointer drifts the cards.
  useEffect(() => {
    const el = tilt.current
    const st = stage.current
    if (!el || !st) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches || window.matchMedia('(max-width: 767px)').matches
    let raf = 0
    const update = () => {
      raf = 0
      const r = st.getBoundingClientRect()
      const p = Math.min(1, Math.max(0, 1 - (r.top - innerHeight * 0.18) / (innerHeight * 0.7)))
      const t = reduce ? 1 : p
      el.style.transform = `rotateX(${(1 - t) * 26}deg) scale(${0.9 + t * 0.1}) translateY(${(1 - t) * -30}px)`
    }
    const onScroll = () => (raf ||= requestAnimationFrame(update))
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      st.style.setProperty('--mx', String(e.clientX / innerWidth - 0.5))
      st.style.setProperty('--my', String(e.clientY / innerHeight - 0.5))
    }
    update()
    addEventListener('scroll', onScroll, { passive: true })
    addEventListener('resize', onScroll)
    addEventListener('pointermove', onMove, { passive: true })
    return () => {
      cancelAnimationFrame(raf)
      removeEventListener('scroll', onScroll)
      removeEventListener('resize', onScroll)
      removeEventListener('pointermove', onMove)
    }
  }, [])

  return (
    <section id="top" className="relative isolate overflow-hidden pt-28 pb-10 sm:pt-32">
      <Aurora fade={false} />
      <div aria-hidden="true" className="pointer-events-none absolute -top-24 -left-28 size-[460px] rounded-full bg-[radial-gradient(closest-side,rgb(241_223_160/0.5),transparent)] sm:size-[680px]" />
      <div aria-hidden="true" className="pointer-events-none absolute top-8 -right-28 size-[400px] rounded-full bg-[radial-gradient(closest-side,rgb(205_214_160/0.5),transparent)] sm:size-[600px]" />
      <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-surface" />

      <GlassSurface
        width="auto"
        height="auto"
        borderRadius={36}
        backgroundOpacity={0.12}
        saturation={1.4}
        brightness={55}
        opacity={0.9}
        blur={14}
        displace={0.5}
        distortionScale={-150}
        className="relative mx-3 max-w-[1100px] sm:mx-auto"
      >
        <div className="flex flex-col items-center px-3 py-10 text-center sm:px-10 sm:py-14">

        <h1 className="mt-4 text-[clamp(46px,8.6vw,112px)] leading-[0.98] font-medium tracking-[-0.045em] text-balance">
          {WORDS.map((w, i) =>
            w === '#icons' ? (
              <span key={w} className="mr-[0.22em] inline-flex translate-y-[0.06em] gap-[0.1em] align-baseline animate-pop" style={{ animationDelay: `${120 + i * 55}ms` }}>
                <span className="grid size-[0.74em] place-items-center rounded-full bg-[linear-gradient(140deg,#fbf0cc,#f1dfa0)] shadow-[inset_0_1px_0_#fff,0_10px_24px_-10px_rgb(200_140_0/0.35)]">
                  <Icon name="chat" size={40} className="size-[0.38em]" />
                </span>
                <span className="grid size-[0.74em] place-items-center rounded-full bg-ink text-white shadow-float">
                  <Icon name="bolt" size={40} className="size-[0.38em]" />
                </span>
              </span>
            ) : (
              <span key={w} className="inline-block overflow-hidden pb-[0.08em] align-bottom">
                <span className="inline-block animate-rise" style={{ animationDelay: `${120 + i * 55}ms` }}>
                  {w}&nbsp;
                </span>
              </span>
            ),
          )}
        </h1>

        <p className="mt-6 max-w-[560px] text-[17px] leading-relaxed text-ink-2 animate-rise sm:text-[19px]" style={{ animationDelay: '420ms' }}>
          Mira gives businesses instant answers, smoother hand-offs, and a calmer daily workflow — without making customers wait.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-2.5 animate-rise" style={{ animationDelay: '480ms' }}>
          <Button size="lg" href="/signup" icon="arrow">
            Start free trial
          </Button>
          <a href="#demo" className="glass inline-flex h-12 items-center gap-2 rounded-pill px-6 text-[15px] font-medium transition-transform active:scale-[0.97]">
            Try it on the phone <Icon name="arrow" size={16} className="rotate-90" />
          </a>
        </div>
        <p className="mt-5 text-[13px] text-muted animate-rise" style={{ animationDelay: '520ms' }}>
          One plan, {naira(price)}/month · Works on any website
        </p>
        </div>
      </GlassSurface>

      {/* The phone, standing up as you scroll, with the live chat inside */}
      <div id="demo" ref={stage} className="relative mx-auto mt-14 flex max-w-[1100px] scroll-mt-6 justify-center px-5 [perspective:1600px] sm:mt-16">
        <div ref={tilt} className="relative origin-[50%_20%] will-change-transform [--pw:min(86vw,360px)] [transform-style:preserve-3d] sm:[--pw:372px]">
          <Phone>
            <StoreScreen />
          </Phone>

          <FloatCard depth={1.2} delay={700} className="top-[9%] -left-[150px] hidden md:block lg:-left-[230px]">
            <div className="flex items-center gap-3 pr-2">
              <IconDot name="check" />
              <span className="text-left text-[12px] leading-tight text-ink-2">
                <span className="block text-[14px] font-medium text-ink">Answers from your data</span>
                prices, stock and policies
              </span>
            </div>
          </FloatCard>

          <FloatCard depth={0.7} delay={820} className="top-[44%] -left-[110px] hidden md:block lg:-left-[250px]">
            <div className="flex w-[210px] items-center gap-3">
              <IconDot name="cart" dark />
              <span className="text-left text-[12px] leading-tight text-muted">
                <span className="block text-[14px] font-medium text-ink">New order · {naira(57000)}</span>
                MRA-2041 via website chat
              </span>
            </div>
          </FloatCard>

          <FloatCard depth={1.5} delay={760} className="top-[16%] -right-[130px] hidden md:block lg:-right-[230px]">
            <div className="flex w-[190px] flex-col gap-2.5 text-left">
              <ProductImage name="Indigo Adire Kaftan" tint="mist" className="h-[92px] rounded-[14px]" />
              <span className="flex items-end justify-between gap-2 px-0.5 text-[13px]">
                <span className="leading-tight">
                  <span className="block font-medium">Indigo Kaftan</span>
                  {naira(38000)}
                </span>
                <Badge tone="lime">14 left</Badge>
              </span>
            </div>
          </FloatCard>

          <FloatCard depth={0.9} delay={880} className="top-[52%] -right-[100px] hidden md:block lg:-right-[220px]">
            <div className="flex items-center gap-3 pr-2">
              <IconDot name="bolt" />
              <span className="text-left text-[12px] leading-tight text-muted">
                <span className="block text-[14px] font-medium text-ink">1.2s average reply</span>
                day and night
              </span>
            </div>
          </FloatCard>

          <FloatCard depth={1.1} delay={940} className="top-[74%] -left-[60px] hidden md:block lg:-left-[170px]">
            <div className="flex flex-col gap-1.5 text-left text-[13px]">
              <span className="self-end rounded-[14px] rounded-br-md bg-ink px-3 py-1.5 text-white">Where’s my order?</span>
              <span className="flex items-center gap-1.5 rounded-[14px] rounded-bl-md bg-white/80 px-3 py-1.5">
                <Icon name="truck" size={14} /> Shipped, arriving Thursday
              </span>
            </div>
          </FloatCard>

        </div>
      </div>
      <p className="relative mt-6 text-center text-[13px] text-muted">Live demo. Type a question and Mira answers from a sample fashion store’s own data.</p>
    </section>
  )
}

export function InlineIcon({ name, dark }: { name: IconName; dark?: boolean }) {
  return (
    <span className={`mx-1 inline-grid size-[0.9em] translate-y-[0.08em] place-items-center rounded-full align-baseline ${dark ? 'bg-ink text-white' : 'glass bg-lime/70 text-ink'}`}>
      <Icon name={name} size={18} className="size-[0.5em]" />
    </span>
  )
}
