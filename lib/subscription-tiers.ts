export const MONTHLY_PRICE_NGN = 50_000

export type TierMonths = 1 | 6 | 12

export interface SubscriptionTier {
  months: TierMonths
  price: number
  fullPrice: number
  savePct: number
}

const TIER_PRICES: Record<TierMonths, number> = {
  1: 50_000,
  6: 270_000,
  12: 500_000,
}

export const SUBSCRIPTION_TIERS: SubscriptionTier[] = ([1, 6, 12] as TierMonths[]).map(
  (months) => {
    const fullPrice = MONTHLY_PRICE_NGN * months
    const price = TIER_PRICES[months]
    return {
      months,
      price,
      fullPrice,
      savePct: Math.round(((fullPrice - price) / fullPrice) * 100),
    }
  }
)

export function addMonths(from: Date, months: number): Date {
  const d = new Date(from)
  d.setMonth(d.getMonth() + months)
  return d
}

/** Extend from existing expiry if still active, otherwise from now. */
export function nextPaidUntil(currentPaidUntil: Date | null, months: number, now = new Date()): Date {
  const base = currentPaidUntil && currentPaidUntil > now ? currentPaidUntil : now
  return addMonths(base, months)
}
