export const naira = (n: number) => `₦${Math.round(n).toLocaleString('en-NG')}`

export const compact = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M` : n >= 10_000 ? `${Math.round(n / 1000)}k` : n.toLocaleString('en-NG')

export const pct = (n: number, signed = false) => `${signed && n > 0 ? '+' : ''}${Math.round(n * 100)}%`

export function timeAgo(iso: string) {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000))
  if (m < 1) return 'now'
  if (m < 60) return `${m}m`
  const h = Math.round(m / 60)
  return h < 24 ? `${h}h` : `${Math.round(h / 24)}d`
}

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')
