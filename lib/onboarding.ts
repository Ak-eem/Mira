// The signup wizard's answers and their validation. Lives in lib/ (not in the
// component) so the rules are testable and shared by the server action.

export type CourierOption = {
  id: string;
  label: string;
  // True only for couriers Mira can actually receive delivery updates from
  // (lib/logistics/connections.ts SUPPORTED_PROVIDERS). Choosing any other
  // courier is still recorded -- it tells us which to build next -- but the
  // wizard must not imply it is connected.
  connectable: boolean;
};

export const COURIER_OPTIONS: readonly CourierOption[] = [
  { id: "shiip", label: "Shiip", connectable: true },
  { id: "gig", label: "GIG Logistics", connectable: false },
  { id: "kwik", label: "Kwik", connectable: false },
  { id: "dhl", label: "DHL", connectable: false },
  { id: "courier-plus", label: "Courier Plus", connectable: false },
  { id: "fez", label: "Fez Delivery", connectable: false },
  { id: "sendbox", label: "Sendbox", connectable: false },
  { id: "other", label: "A different courier", connectable: false },
  // Not a courier, but a real answer: distinct from skipping the question.
  { id: "self", label: "I deliver orders myself", connectable: false },
];

export type OnboardingAnswers = {
  wantsEmailChannel: boolean | null;
  tracksInventory: boolean | null;
  logisticsProvider: string | null;
};

export type NormalizeResult = { ok: true; answers: OnboardingAnswers } | { ok: false; error: string };

export function isConnectableCourier(id: string | null): boolean {
  return COURIER_OPTIONS.some((option) => option.id === id && option.connectable);
}

function tri(value: unknown): boolean | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value;
  return undefined; // wrong type: caller treats as invalid
}

/**
 * Validates input that arrives from the browser. Unanswered questions are
 * null (that is how "skip" is recorded). Anything that isn't a boolean /
 * a known courier id is rejected rather than coerced, so a crafted request
 * can't smuggle arbitrary text into the businesses table.
 */
export function normalizeAnswers(input: unknown): NormalizeResult {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return { ok: false, error: "Invalid request." };
  const raw = input as Record<string, unknown>;

  const wantsEmailChannel = tri(raw.wantsEmailChannel);
  const tracksInventory = tri(raw.tracksInventory);
  if (wantsEmailChannel === undefined || tracksInventory === undefined) return { ok: false, error: "Invalid request." };

  let logisticsProvider: string | null = null;
  if (raw.logisticsProvider !== null && raw.logisticsProvider !== undefined) {
    if (typeof raw.logisticsProvider !== "string" || !COURIER_OPTIONS.some((o) => o.id === raw.logisticsProvider)) {
      return { ok: false, error: "Unknown courier option." };
    }
    logisticsProvider = raw.logisticsProvider;
  }

  return { ok: true, answers: { wantsEmailChannel, tracksInventory, logisticsProvider } };
}
