'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { cx, naira } from '@/lib/site/format'
import { Aurora, InlineIcon } from './hero'
import GlassSurface from './GlassSurface'
import { Icon } from './icons'
import { Badge, Button, Chip, Logo, Orb, ProductImage, Toggle } from './ui'

/* ---------- Nav ---------- */

const NAV = [
  ['Features', '#features'],
  ['Industries', '#industries'],
  ['Pricing', '#pricing'],
] as const

export function Nav() {
  const [open, setOpen] = useState(false)
  return (
    <header className="fixed inset-x-0 top-3 z-40 mx-auto flex w-full max-w-[1240px] items-center justify-between gap-4 px-3 sm:px-5">
      <GlassSurface
        width="auto"
        height="auto"
        borderRadius={999}
        backgroundOpacity={0.12}
        saturation={1.4}
        brightness={55}
        opacity={0.9}
        blur={14}
        displace={0.5}
        distortionScale={-150}
        className="flex h-14 w-full items-center justify-between rounded-pill pr-2 pl-5"
      >
        <a href="#top" aria-label="Mira home">
          <Logo />
        </a>
        <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
          {NAV.map(([l, h]) => (
            <a key={h} href={h} className="rounded-pill px-4 py-2 text-sm text-ink-2 transition-colors hover:bg-mist hover:text-ink">
              {l}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="sm" href="/login" className="h-10 px-4">
            Log in
          </Button>
          <span className="hidden sm:block">
            <Button size="sm" href="/signup" className="h-10 px-4">
              Start free trial
            </Button>
          </span>
          <button type="button" onClick={() => setOpen((o) => !o)} className="grid size-10 place-items-center rounded-full bg-mist md:hidden" aria-label="Menu" aria-expanded={open}>
            <Icon name={open ? 'x' : 'menu'} />
          </button>
        </div>
      </GlassSurface>
      {open && (
        <div className="glass absolute top-16 right-3 left-3 flex flex-col gap-1 rounded-[24px] p-2 shadow-float animate-pop md:hidden">
          {NAV.map(([l, h]) => (
            <a key={h} href={h} onClick={() => setOpen(false)} className="rounded-[16px] px-4 py-3 text-[15px] hover:bg-mist">
              {l}
            </a>
          ))}
          <Button href="/signup" size="lg" className="mt-1">
            Start free trial
          </Button>
        </div>
      )}
    </header>
  )
}

export function Ring({ value, size = 64 }: { value: number; size?: number }) {
  const r = size / 2 - 4
  const c = 2 * Math.PI * r
  return (
    <span className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-lime)" strokeWidth={5} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-ink)" strokeWidth={2} strokeDasharray={`${c * value} ${c}`} strokeLinecap="round" />
      </svg>
      <span className="absolute text-[15px] font-medium tabular-nums">{Math.round(value * 100)}%</span>
    </span>
  )
}

/* ---------- Industries (social proof) ---------- */

const INDUSTRIES = [
  { name: 'Fashion', q: '“Do you have this in size 14?”', tint: 'lime' as const, h: 'h-[260px]' },
  { name: 'Banks', q: '“How do I raise my transfer limit?”', tint: 'mist' as const, h: 'h-[200px]' },
  { name: 'Schools', q: '“When does second term resume?”', tint: 'stone' as const, h: 'h-[300px]' },
  { name: 'Hospitals', q: '“Is the clinic open on Saturday?”', tint: 'sand' as const, h: 'h-[220px]' },
  { name: 'Restaurants', q: '“Do you deliver to Lekki Phase 1?”', tint: 'lime' as const, h: 'h-[280px]' },
]

export function Industries() {
  return (
    <section id="industries" className="scroll-mt-24 overflow-hidden py-16 lg:py-24">
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-start justify-between gap-6 px-5 text-[13px] sm:px-8">
        <span>Always on</span>
        <span className="flex items-start gap-2">
          <span className="mt-1.5 size-1.5 rounded-full bg-ink" />
          Answers from your own data,
          <br />
          never from guesswork
        </span>
        <span className="text-right">
          One assistant,
          <br />
          any business
        </span>
      </div>
      <h2
        className="mx-auto mt-10 max-w-[1240px] px-4 text-center text-[17vw] leading-[0.9] font-medium tracking-[-0.05em] lg:text-[200px]"
        style={{ background: 'linear-gradient(90deg, var(--color-lime) 0%, #f0f0ea 55%, #ececf0 100%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}
      >
        BUILT FOR
      </h2>
      <div className="mx-auto -mt-[4vw] flex max-w-[1240px] snap-x snap-mandatory items-end gap-4 overflow-x-auto px-5 pb-4 sm:px-8 lg:-mt-14 [scrollbar-width:none]">
        {INDUSTRIES.map((i) => (
          <figure key={i.name} className="flex w-[64vw] shrink-0 snap-start flex-col gap-2 sm:w-[260px] lg:w-auto lg:flex-1">
            <figcaption className="text-[13px] text-muted">{i.name}</figcaption>
            <div className={cx('group relative overflow-hidden rounded-[22px]', i.h)}>
              <ProductImage name={i.name} tint={i.tint} className="absolute inset-0 transition-transform duration-300 group-hover:scale-[1.03]" />
              <span className="glass absolute right-3 bottom-3 left-3 rounded-[16px] px-3 py-2.5 text-[13px] leading-snug">{i.q}</span>
            </div>
          </figure>
        ))}
      </div>
      <div className="mt-10 overflow-hidden border-y border-line/80 bg-surface/50 py-4" aria-hidden="true">
        <div className="marquee flex w-max gap-10 text-[15px] text-muted">
          {[...Array(2)].flatMap((_, k) =>
            ['Fashion stores', 'Banks & fintech', 'Schools', 'Hospitals & clinics', 'Restaurants', 'Pharmacies', 'Salons', 'Real estate'].map((t) => (
              <span key={`${k}-${t}`} className="flex items-center gap-10">
                {t} <span className="size-1 rounded-full bg-lime-3" />
              </span>
            )),
          )}
        </div>
      </div>
    </section>
  )
}

/* ---------- Features: stacked panels, as in the inspo ---------- */

function FeatureChat() {
  return (
    <div className="flex w-full max-w-[340px] flex-col gap-2.5">
      <span className="self-end rounded-[18px] rounded-br-md bg-ink px-3.5 py-2.5 text-sm text-white">Is the wrap dress in stock?</span>
      <span className="self-start rounded-[18px] rounded-bl-md glass-strong px-3.5 py-2.5 text-sm">Yes, 6 left in the Ankara Wrap Dress. It’s ₦27,500.</span>
      <div className="flex w-[168px] flex-col overflow-hidden rounded-[18px] glass-strong">
        <ProductImage name="Ankara Wrap Dress" tint="lime" className="h-24" />
        <span className="flex items-center justify-between p-3 text-[13px]">
          ₦27,500 <Badge tone="lime">6 left</Badge>
        </span>
      </div>
    </div>
  )
}

function FeatureCatalog() {
  const [items, setItems] = useState([
    { n: 'Indigo Kaftan', p: 38000, on: true, t: 'mist' as const },
    { n: 'Aso-Oke Clutch', p: 18000, on: false, t: 'sand' as const },
    { n: 'Two-Piece Set', p: 31000, on: true, t: 'lime' as const },
  ])
  return (
    <div className="flex w-full max-w-[360px] flex-col gap-2">
      {items.map((it, i) => (
        <div key={it.n} className="flex items-center gap-3 rounded-[18px] glass-strong p-2.5 pr-3.5">
          <ProductImage name={it.n} tint={it.t} className="size-12 rounded-[12px]" />
          <span className="flex-1 text-sm">
            {it.n}
            <span className="block text-[13px] text-muted">{naira(it.p)}</span>
          </span>
          <Toggle checked={it.on} label={`${it.n} available`} onChange={(v) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, on: v } : x)))} />
        </div>
      ))}
    </div>
  )
}

function FeatureOrders() {
  const steps = ['Cart', 'Placed', 'Shipped', 'Delivered']
  const [at, setAt] = useState(2)
  useEffect(() => {
    const t = setInterval(() => setAt((a) => (a + 1) % 4), 1600)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="w-full max-w-[380px] rounded-[22px] glass-strong p-5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">MRA-2040</span>
        <Badge tone={at === 3 ? 'ink' : 'lime'}>{steps[at]}</Badge>
      </div>
      <div className="mt-5 grid grid-cols-4 gap-1.5">
        {steps.map((s, i) => (
          <div key={s} className="flex flex-col gap-2">
            <span className={cx('h-1.5 rounded-pill transition-colors duration-300', i <= at ? 'bg-ink' : 'bg-line')} />
            <span className={cx('text-[11px] transition-colors', i <= at ? 'text-ink' : 'text-muted')}>{s}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function FeatureInsights() {
  const bars = [40, 62, 48, 80, 70, 96, 88]
  return (
    <div className="flex w-full max-w-[380px] items-end gap-4">
      <div className="flex-1 rounded-[22px] glass-strong p-4">
        <p className="text-[13px] text-muted">Most asked this week</p>
        <p className="mt-1 text-sm font-medium">“How much is delivery to Abuja?”</p>
        <div className="mt-4 flex h-20 items-end gap-1.5">
          {bars.map((b, i) => (
            <span key={i} className={cx('flex-1 rounded-[6px]', i === bars.length - 2 ? 'bg-ink' : 'bg-lime-2')} style={{ height: `${b}%` }} />
          ))}
        </div>
      </div>
      <div className="flex flex-col items-center gap-2 rounded-[22px] glass-strong p-4">
        <Ring value={0.29} size={72} />
        <span className="text-center text-[11px] leading-tight text-muted">
          fewer delivery
          <br />
          complaints
        </span>
      </div>
    </div>
  )
}

const FEATURES = [
  { chip: 'Chat assistant', title: 'Answers in seconds, from your own data', body: 'Prices, sizes, stock, delivery fees, opening hours. Mira only says what your business has told it, and passes anything else to you.', tone: 'glass-lime', visual: <FeatureChat /> },
  { chip: 'Product catalog', title: 'Prices and stock, always current', body: 'Add products once. Flip availability from your phone and the assistant stops offering what you’ve sold out of.', tone: 'glass-strong', visual: <FeatureCatalog /> },
  { chip: 'Order management', title: 'From cart to doorstep, in one list', body: 'Every order moves cart → placed → shipped → delivered, and customers can ask the assistant where theirs is.', tone: 'glass-lime', visual: <FeatureOrders /> },
  { chip: 'Insights dashboard', title: 'Know what customers really want', body: 'See recurring complaints, the questions asked most, and which products are hot or sitting still.', tone: 'glass-strong', visual: <FeatureInsights /> },
]

export function Features() {
  const cards = useRef<(HTMLElement | null)[]>([])

  // As the next card slides over, the one beneath sinks back a little.
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let raf = 0
    const update = () => {
      raf = 0
      const els = cards.current
      els.forEach((el, i) => {
        const next = els[i + 1]
        if (!el || !next) return
        const a = el.getBoundingClientRect()
        const b = next.getBoundingClientRect()
        const p = Math.min(1, Math.max(0, (a.bottom - b.top) / a.height))
        el.style.transform = `scale(${1 - p * 0.06})`
        el.style.filter = p > 0 ? `brightness(${1 - p * 0.08})` : ''
      })
    }
    const onScroll = () => (raf ||= requestAnimationFrame(update))
    update()
    addEventListener('scroll', onScroll, { passive: true })
    addEventListener('resize', onScroll)
    return () => {
      cancelAnimationFrame(raf)
      removeEventListener('scroll', onScroll)
      removeEventListener('resize', onScroll)
    }
  }, [])

  return (
    <section id="features" className="relative isolate scroll-mt-24 py-10 lg:py-16">
      <Aurora className="-z-10" />
      <div className="mx-auto max-w-[1240px] px-3 sm:px-5">
      <div className="mx-auto mb-10 max-w-[720px] px-2 text-center">
        <h2 className="text-[34px] leading-[1.05] font-medium tracking-[-0.03em] text-balance sm:text-[48px]">
          Customer service
          <InlineIcon name="trend" />
          <InlineIcon name="spark" dark /> that runs itself
        </h2>
      </div>
      <div className="flex flex-col gap-4">
        {FEATURES.map((f, i) => (
          <article
            key={f.chip}
            ref={(el) => {
              cards.current[i] = el
            }}
            className={cx(
              'sticky top-[calc(76px+var(--i)*12px)] grid origin-top items-center gap-6 rounded-[32px] px-5 py-7 will-change-transform sm:top-[calc(88px+var(--i)*18px)] sm:gap-8 sm:rounded-panel sm:px-12 sm:py-10 lg:min-h-[420px] lg:grid-cols-2 lg:py-12',
              f.tone,
            )}
            style={{ ['--i' as string]: i }}
          >
            <div className="flex flex-col items-start gap-4 sm:gap-5">
              <Chip>{f.chip}</Chip>
              <h3 className="max-w-[420px] text-[25px] leading-[1.1] font-medium tracking-[-0.025em] sm:text-[36px]">{f.title}</h3>
              <p className="max-w-[400px] text-[14px] leading-relaxed text-ink-2 sm:text-[15px]">{f.body}</p>
            </div>
            <div className="flex justify-center lg:justify-end">{f.visual}</div>
          </article>
        ))}
      </div>
      </div>
    </section>
  )
}

/* ---------- How it works ---------- */

export function Steps() {
  const steps = [
    ['Add your business', 'Products, prices, FAQs, policies and opening hours. Or import a spreadsheet.'],
    ['Paste one line', 'Add the widget to your website. It takes your brand colour automatically.'],
    ['Customers get answers', 'Day and night. You see every chat, order and insight on your phone.'],
  ]
  return (
    <section className="mx-auto grid max-w-[1240px] gap-4 px-5 py-14 sm:px-8 md:grid-cols-3">
      {steps.map(([t, b], i) => (
        <div key={t} className="flex flex-col gap-3 border-t border-ink/15 pt-5">
          <span className="font-mono text-xs text-muted">0{i + 1}</span>
          <h3 className="text-xl font-medium tracking-tight">{t}</h3>
          <p className="text-[15px] leading-relaxed text-ink-2">{b}</p>
        </div>
      ))}
    </section>
  )
}

/* ---------- Pricing ---------- */

const INCLUDED = [
  '24/7 chat assistant on your website',
  'Product catalog with prices and stock',
  'Order tracking: cart → placed → shipped → delivered',
  'Insights: complaints, top questions, hot and slow products',
  'FAQs, policies, opening hours and promotions',
  'Unlimited conversations',
]

export function Pricing({ price = 50000 }: { price?: number }) {
  return (
    <section id="pricing" className="relative isolate scroll-mt-24 py-14 lg:py-20">
      <Aurora className="-z-10" intensity={0.9} />
      <div className="mx-auto max-w-[1240px] px-3 sm:px-5">
      <div className="glass-strong grid overflow-hidden rounded-panel lg:grid-cols-[1fr_1.1fr]">
        <div className="relative flex flex-col justify-between gap-10 overflow-hidden bg-ink p-8 text-white sm:p-12">
          <div aria-hidden="true" className="absolute -right-24 -bottom-24 size-80 rounded-full bg-lime-2 opacity-20 blur-3xl" />
          <div className="flex flex-col gap-4">
            <span className="inline-flex h-8 w-fit items-center rounded-pill border border-white/25 px-3.5 text-[13px] text-white/80">One plan. Everything included.</span>
            <h2 className="text-[34px] leading-[1.05] font-medium tracking-[-0.03em] sm:text-[44px]">Simple pricing for any business</h2>
          </div>
          <div className="relative">
            <p className="flex items-end gap-2">
              <span className="text-[56px] leading-none font-medium tracking-[-0.04em] tabular-nums sm:text-[72px]">{naira(price)}</span>
              <span className="pb-2 text-white/60">/month</span>
            </p>
            <div className="mt-6 flex flex-wrap gap-2.5">
              <Button variant="lime" size="lg" href="/signup" icon="arrow">
                Start free trial
              </Button>
            </div>
            <p className="mt-3 text-[13px] text-white/50">No card needed to start.</p>
          </div>
        </div>
        <ul className="flex flex-col justify-center gap-1 p-6 sm:p-10">
          {INCLUDED.map((x) => (
            <li key={x} className="flex items-center gap-3 rounded-[16px] px-3 py-3 text-[15px] transition-colors hover:bg-white/60">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-lime text-ink">
                <Icon name="check" size={14} />
              </span>
              {x}
            </li>
          ))}
        </ul>
      </div>
      </div>
    </section>
  )
}

/* ---------- Contact + signup footer ---------- */

export function Footer() {
  const router = useRouter()
  const [sent, setSent] = useState(false)
  const [sending, setSending] = useState(false)
  const [contactError, setContactError] = useState('')
  return (
    <footer className="mt-6 bg-mist">
      <div className="mx-auto grid max-w-[1240px] gap-10 px-5 py-16 sm:px-8 lg:grid-cols-2 lg:py-20">
        <div className="flex flex-col gap-6">
          <h2 className="flex items-center gap-5 text-[40px] leading-[1.02] font-medium tracking-[-0.035em] sm:text-[56px]">
            Let’s get
            <br />
            you set up
            <span className="grid size-20 shrink-0 place-items-center rounded-full bg-surface shadow-soft">
              <Icon name="phone" size={26} />
            </span>
          </h2>
          <form
            className="flex w-full max-w-[460px] gap-2 rounded-pill bg-surface p-1.5 shadow-soft"
            onSubmit={(e) => {
              e.preventDefault()
              const email = new FormData(e.currentTarget).get('email')
              router.push(`/signup${email ? `?email=${encodeURIComponent(String(email))}` : ''}`)
            }}
          >
            <input name="email" type="email" required placeholder="Your work email" aria-label="Work email" className="h-11 min-w-0 flex-1 rounded-pill px-4 text-[15px] outline-none" />
            <Button type="submit">Start free trial</Button>
          </form>
        </div>

        <form
          className="flex flex-col gap-3 rounded-card bg-surface p-6 shadow-soft"
          onSubmit={async (e) => {
            e.preventDefault()
            const form = e.currentTarget
            const f = Object.fromEntries(new FormData(form)) as Record<string, string>
            if (!f.contact?.trim() || !f.message?.trim()) {
              setContactError('Add a phone or email and a short message.')
              return
            }
            setSending(true)
            setContactError('')
            try {
              const res = await fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) })
              if (!res.ok) throw new Error('failed')
              setSent(true)
            } catch {
              setContactError('Could not send that. Please try again, or email us directly.')
            } finally {
              setSending(false)
            }
          }}
        >
          <p className="text-lg font-medium">Talk to the team</p>
          {sent ? (
            <p className="flex items-center gap-2 py-8 text-[15px] text-ink-2 animate-rise">
              <span className="grid size-7 place-items-center rounded-full bg-lime">
                <Icon name="check" size={15} />
              </span>
              Thanks! The team will get back to you shortly.
            </p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field name="name" label="Your name" />
                <Field name="business" label="Business name" />
              </div>
              <Field name="contact" label="Phone or email" />
              <label className="flex flex-col gap-1.5 text-[13px] text-muted">
                What do you need help with?
                <textarea name="message" rows={3} className="resize-none rounded-[16px] bg-mist px-4 py-3 text-[15px] text-ink outline-none focus:bg-line/60" />
              </label>
              <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
              {contactError && <p className="text-[13px] text-red-600">{contactError}</p>}
              <Button type="submit" className="mt-1 self-start" disabled={sending}>
                {sending ? 'Sending…' : 'Send message'}
              </Button>
            </>
          )}
        </form>
      </div>
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-4 border-t border-line px-5 py-6 text-[13px] text-muted sm:px-8">
        <Logo className="text-ink" />
        <span>miraapp.com.ng</span>
        <span className="flex gap-4">
          <a href="/login" className="hover:text-ink">
            Log in
          </a>
        </span>
      </div>
    </footer>
  )
}

export function Field({ name, label, type = 'text', defaultValue }: { name: string; label: string; type?: string; defaultValue?: string }) {
  return (
    <label className="flex flex-col gap-1.5 text-[13px] text-muted">
      {label}
      <input name={name} type={type} defaultValue={defaultValue} className="h-11 rounded-[14px] bg-mist px-4 text-[15px] text-ink outline-none transition-colors focus:bg-line/60" />
    </label>
  )
}
