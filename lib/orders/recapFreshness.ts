// A recap quotes prices and stock at one moment. A "yes" that arrives long after it must not
// place the order at the old quote, so past this age the customer is asked to start the recap again.
export const ORDER_RECAP_TTL_MS = 2 * 60 * 60 * 1000;

export function isRecapFresh(createdAt: string | null | undefined, now: number = Date.now()): boolean {
  if (!createdAt) return false;
  const at = Date.parse(createdAt);
  if (Number.isNaN(at)) return false;
  // A timestamp slightly in the future (clock skew) still counts as fresh.
  return now - at <= ORDER_RECAP_TTL_MS;
}
