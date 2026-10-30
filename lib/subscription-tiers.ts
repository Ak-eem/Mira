export const MONTHLY_PRICE_NGN = 50_000

const PAYSTACK_RATE = 0.015
const PAYSTACK_FLAT = 100
const PAYSTACK_CAP = 2_000
const PAYSTACK_FLAT_WAIVER_THRESHOLD = 2_500

export type TierMonths = 1 | 6 | 12

export interface SubscriptionTier {
  months: TierMonths
  price: number
  fullPrice: number
  savePct: number
  processingFee: number
  total: number
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
    const total = grossUp(price)
    return {
      months,
      price,
      fullPrice,
      savePct: Math.round(((fullPrice - price) / fullPrice) * 100),
      processingFee: total - price,
      total,
    }
  }
)

export function paystackFee(amount: number): number {
  if (amount < PAYSTACK_FLAT_WAIVER_THRESHOLD) {
    return amount * PAYSTACK_RATE
  }
  return Math.min(amount * PAYSTACK_RATE + PAYSTACK_FLAT, PAYSTACK_CAP)
}

/** Gross amount to charge so the merchant nets exactly `net` after Paystack's fee.
 * Paystack's 7.5% VAT treatment on its fee is unconfirmed; figures may be a few naira light, so reconcile against a real transaction from the dashboard.
 */
export function grossUp(net: number): number {
  if (net < PAYSTACK_FLAT_WAIVER_THRESHOLD) {
    return Math.ceil(net / (1 - PAYSTACK_RATE))
  }
  const candidate = Math.ceil((net + PAYSTACK_FLAT) / (1 - PAYSTACK_RATE))
  if (paystackFee(candidate) >= PAYSTACK_CAP) {
    return net + PAYSTACK_CAP
  }
  return candidate
}

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