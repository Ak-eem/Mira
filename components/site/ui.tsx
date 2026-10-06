import Link from 'next/link'
import type { ComponentProps, ReactNode } from 'react'
import { cx } from '@/lib/site/format'
import { CountUp, Sparkline } from './fx'
import { Icon, type IconName } from './icons'

/** The Mira mark: three soft bars, like a voice that's answering. */
export function Logo({ className, wordmark = true }: { className?: string; wordmark?: boolean }) {
  return (
    <span className={cx('inline-flex items-center gap-2 font-medium tracking-tight', className)}>
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
        <rect x="2" y="7" width="5" height="10" rx="2.5" fill="currentColor" />
        <rect x="8.5" y="3" width="5" height="16" rx="2.5" fill="currentColor" />
        <rect x="15" y="9" width="5" height="7" rx="2.5" fill="var(--color-lime-3)" />
      </svg>
      {wordmark && <span className="text-[17px]">Mira</span>}
    </span>
  )
}

type ButtonProps = {
  variant?: 'ink' | 'soft' | 'ghost' | 'lime'
  size?: 'sm' | 'md' | 'lg'
  icon?: IconName
  href?: string
  children: ReactNode
} & Omit<ComponentProps<'button'>, 'children'>

const buttonBase =
  'inline-flex items-center justify-center gap-2 rounded-pill font-medium whitespace-nowrap select-none transition-[transform,background-color,box-shadow,color] duration-[var(--duration-fast)] ease-[var(--ease-out)] active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none'
const buttonVariants = {
  ink: 'bg-ink text-white hover:bg-ink-2 shadow-[0_6px_16px_-8px_rgb(17_17_18/0.6)]',
  soft: 'bg-mist text-ink hover:bg-line',
  ghost: 'text-ink hover:bg-mist',
  lime: 'bg-lime-2 text-ink hover:bg-[#dcea6f]',
}
const buttonSizes = { sm: 'h-8 px-3.5 text-[13px]', md: 'h-10 px-5 text-sm', lg: 'h-12 px-6 text-[15px]' }

export function Button({ variant = 'ink', size = 'md', icon, href, children, className, ...rest }: ButtonProps) {
  const cls = cx(buttonBase, buttonVariants[variant], buttonSizes[size], className)
  const inner = (
    <>
      {children}
      {icon && <Icon name={icon} size={size === 'sm' ? 14 : 16} />}
    </>
  )
  if (href) {
    return (
      <Link href={href} className={cls}>
        {inner}
      </Link>
    )
  }
  return (
    <button className={cls} {...rest}>
      {inner}
    </button>
  )
}

/** Outlined label chip, as in "Problem-Solving Expertise". */
export function Chip({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx('inline-flex h-8 items-center rounded-pill border border-ink/25 px-3.5 text-[13px] text-ink-2', className)}>{children}</span>
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'lime' | 'ink' | 'danger'; children: ReactNode }) {
  const tones = {
    neutral: 'bg-mist text-ink-2',
    lime: 'bg-lime text-ink [box-shadow:inset_0_0_0_1px_var(--color-lime-2)]',
    ink: 'bg-ink text-white',
    danger: 'bg-[#fbeae6] text-danger',
  }
  return <span className={cx('inline-flex h-6 items-center gap-1.5 rounded-pill px-2.5 text-xs font-medium', tones[tone])}>{children}</span>
}

export function Card({ className, children, ...rest }: ComponentProps<'div'>) {
  return (
    <div className={cx('glass-card rounded-card p-5', className)} {...rest}>
      {children}
    </div>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cx('relative h-6 w-10 shrink-0 rounded-pill transition-colors duration-[var(--duration-base)]', checked ? 'bg-ink' : 'bg-line')}
    >
      <span
        className={cx(
          'absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow-soft transition-transform duration-[var(--duration-base)] ease-[var(--ease-out)]',
          checked && 'translate-x-4',
        )}
      >
        {checked && <span className="absolute inset-1.5 rounded-full bg-lime-3" />}
      </span>
    </button>
  )
}

/** Soft frosted orb, from the inspo's loader. */
export function Orb({ className, children }: { className?: string; children?: ReactNode }) {
  return (
    <div
      className={cx(positioned(className), 'grid place-items-center rounded-full', className)}
      style={{
        background: 'radial-gradient(circle at 32% 28%, #ffffff 0%, #f6f6f8 38%, #e3e3e8 70%, #d3d3da 100%)',
        boxShadow: 'inset -14px -18px 40px rgb(17 17 18 / 0.08), inset 10px 12px 28px rgb(255 255 255 / 0.9), 0 40px 80px -30px rgb(17 17 18 / 0.35)',
      }}
    >
      <span className="pointer-events-none absolute inset-[6%] rounded-full" style={{ background: 'radial-gradient(circle at 70% 78%, rgb(229 241 134 / 0.45), transparent 55%)' }} />
      {children}
    </div>
  )
}

/** Keep `relative` unless the caller positions the element itself. */
const positioned = (className?: string) => (/\b(absolute|fixed|sticky)\b/.test(className ?? '') ? '' : 'relative')

const tints = {
  lime: ['#fbf0cc', '#f6d56b'],
  sand: ['#f7eee2', '#e7cfae'],
  mist: ['#f3f3f6', '#d9d9e1'],
  stone: ['#efefe9', '#cfcfc4'],
}

/** Product image, or a soft clay-like placeholder when there's no photo yet. */
export function ProductImage({ image, name, tint = 'mist', className }: { image?: string; name: string; tint?: keyof typeof tints; className?: string }) {
  if (image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={image} alt={name} className={cx('object-cover', className)} loading="lazy" />
  }
  const [a, b] = tints[tint]
  return (
    <div role="img" aria-label={name} className={cx(positioned(className), 'overflow-hidden', className)} style={{ background: `linear-gradient(160deg, ${a}, ${b})` }}>
      <span className="absolute left-[18%] top-[22%] h-[62%] w-[38%] rounded-[40%_40%_30%_30%] bg-white/70 shadow-[inset_-6px_-8px_14px_rgb(0_0_0/0.06)]" />
      <span className="absolute right-[16%] bottom-[16%] size-[34%] rounded-full bg-white/55 shadow-[inset_-5px_-6px_12px_rgb(0_0_0/0.06)]" />
    </div>
  )
}

export function Stat({ label, value, delta, format = (n: number) => n.toLocaleString('en-NG'), spark, delay = 0 }: { label: string; value: number; delta?: number; format?: (n: number) => string; spark?: number[]; delay?: number }) {
  return (
    <Card className="group relative flex flex-col gap-3 overflow-hidden transition-transform duration-[var(--duration-base)] ease-[var(--ease-out)] hover:-translate-y-0.5 animate-rise" style={{ animationDelay: `${delay}ms` }}>
      <span className="text-[13px] text-muted">{label}</span>
      <span className="text-[26px] leading-none font-medium tracking-tight tabular-nums sm:text-[30px]">
        <CountUp value={value} format={format} />
      </span>
      <span className="flex items-end justify-between gap-2">
        {delta !== undefined && (
          <span className={cx('inline-flex items-center gap-1 text-xs', delta >= 0 ? 'text-ink-2' : 'text-danger')}>
            <span className={cx('rounded-pill px-1.5 py-0.5', delta >= 0 ? 'bg-lime-2/70' : 'bg-[#fbeae6]')}>
              {delta > 0 ? '+' : ''}
              {Math.round(delta * 100)}%
            </span>
            <span className="hidden sm:inline">vs last 14 days</span>
          </span>
        )}
        {spark && <Sparkline data={spark} />}
      </span>
    </Card>
  )
}
