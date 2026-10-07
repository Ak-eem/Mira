import { isFallbackReply } from "@/lib/ai/buildPrompt";

// "Grounding": does what Mira said match the business's own information?
//
// Deliberately NOT a statistical confidence score -- neither provider returns
// one (Groq doesn't support logprobs; Gemini 3.x deprecates them) and token
// probabilities wouldn't measure factual support anyway. Instead this is a
// deterministic overlap check, a set difference between the checkable facts in
// the reply and the facts in the knowledge Mira was given:
//
//   unsupported = facts_in_reply - facts_in_knowledge
//
// It catches the mistakes that actually cost a shop money -- wrong prices,
// hours, links, phone numbers -- and a short list of risky policy claims
// (delivery, refunds, warranty...). It does NOT catch a wrong sentence that
// contains none of those, which is why "unchecked" is a verdict of its own
// rather than being reported as "high".

export type GroundingVerdict = "high" | "medium" | "low" | "unchecked";
export type SignalType = "price" | "time" | "link" | "contact" | "claim" | "fallback";
export type GroundingSignal = { type: SignalType; value: string; supported: boolean };
export type GroundingResult = { verdict: GroundingVerdict; signals: GroundingSignal[] };

export type GroundingInput = {
  reply: string;
  // The exact business text the model was given (BusinessContext.contextText).
  knowledge: string;
  // What the customer said in this conversation: numbers, times and links they
  // gave are legitimately repeated back (quantities, budgets, "5pm").
  customerMessages: string[];
  businessName: string;
  currency: string;
};

const MAX_SIGNALS = 12;

// ---- small helpers -------------------------------------------------------

function mask(text: string, regex: RegExp, onMatch: (match: RegExpMatchArray) => void): string {
  return text.replace(regex, (...args) => {
    const match = args.slice(0, -2) as unknown as RegExpMatchArray;
    onMatch(match);
    return " ".repeat(String(args[0]).length);
  });
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function parseAmount(raw: string, suffix?: string): number | null {
  const value = parseFloat(raw.replace(/,/g, ""));
  if (!Number.isFinite(value)) return null;
  const multiplier = suffix && /k/i.test(suffix) ? 1_000 : suffix && /m/i.test(suffix) ? 1_000_000 : 1;
  return roundMoney(value * multiplier);
}

function formatAmount(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

// ---- extraction ----------------------------------------------------------

const EMAIL_REGEX = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;
const LINK_REGEX =
  /(?:https?:\/\/[^\s)>\]"']+|(?<![@\w.-])(?:[a-z0-9-]+\.)+(?:com|ng|co|org|net|io|app|shop|store|biz|info)(?:\/[^\s)>\]"']*)?(?![\w@-]))/gi;
const PHONE_REGEX = /\+?\d[\d\s().-]{8,}\d/g;
const TIME_12H_REGEX = /\b(\d{1,2})(?::(\d{2}))?\s?([ap])\.?m\.?(?![a-z])/gi;
const TIME_24H_REGEX = /(?<![\d:.])([01]?\d|2[0-3]):([0-5]\d)(?![\d:])/g;

function normalizeLink(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[).,;!?]+$/, "")
    .replace(/\/+$/, "");
}

function phoneKey(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15 ? digits.slice(-10) : null;
}

function priceRegex(currency: string): RegExp {
  const codes = Array.from(new Set([currency.toUpperCase(), "NGN", "USD", "GBP", "EUR", "GHS", "KES", "ZAR"]))
    .filter((code) => /^[A-Z]{3}$/.test(code))
    .join("|");
  // symbol or code BEFORE the number: ₦15,000  N15,000  NGN 15000  $20  15k handled by suffix
  return new RegExp(
    String.raw`(?:₦|\$|£|€|(?<![A-Za-z])N(?=\s?\d)|\b(?:${codes})\b)\s?(\d[\d,]*(?:\.\d+)?)\s?([kKmM])?(?![\w])`,
    "g",
  );
}

const PRICE_WORD_AFTER_REGEX = /(\d[\d,]*(?:\.\d+)?)\s?([kKmM])?\s?(?:naira|ngn|dollars?|usd|pounds?|gbp)\b/gi;
const ANY_NUMBER_REGEX = /\d[\d,]*(?:\.\d+)?\s?([kKmM])?(?![\w])/g;

function timeToMinutes(hourRaw: string, minuteRaw: string | undefined, meridiem?: string): number | null {
  let hour = parseInt(hourRaw, 10);
  const minute = minuteRaw ? parseInt(minuteRaw, 10) : 0;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    const pm = meridiem.toLowerCase() === "p";
    if (hour === 12) hour = 0;
    if (pm) hour += 12;
  }
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

function extractTimes(text: string): Map<number, string> {
  const found = new Map<number, string>();
  let work = text;
  work = mask(work, TIME_12H_REGEX, (m) => {
    const minutes = timeToMinutes(m[1], m[2], m[3]);
    if (minutes !== null && !found.has(minutes)) found.set(minutes, m[0].trim());
  });
  mask(work, TIME_24H_REGEX, (m) => {
    const minutes = timeToMinutes(m[1], m[2]);
    if (minutes !== null && !found.has(minutes)) found.set(minutes, m[0].trim());
  });
  return found;
}

function extractPrices(text: string, currency: string): { amount: number; label: string }[] {
  const out: { amount: number; label: string }[] = [];
  const push = (match: RegExpMatchArray) => {
    const amount = parseAmount(match[1], match[2]);
    if (amount !== null && amount > 0) out.push({ amount, label: match[0].trim() });
  };
  const afterSymbols = mask(text, priceRegex(currency), push);
  mask(afterSymbols, PRICE_WORD_AFTER_REGEX, push);
  return out;
}

function extractAllNumbers(text: string): Set<number> {
  const numbers = new Set<number>();
  for (const match of text.matchAll(ANY_NUMBER_REGEX)) {
    const raw = match[0].replace(/[kKmM]$/, "").trim();
    const plain = parseAmount(raw);
    if (plain !== null) numbers.add(plain);
    const suffixed = parseAmount(raw, match[1]);
    if (suffixed !== null) numbers.add(suffixed);
  }
  return numbers;
}

// ---- risky policy claims -------------------------------------------------

type ClaimRule = { label: string; reply: RegExp; known: RegExp };

const CLAIM_RULES: ClaimRule[] = [
  { label: "delivery", reply: /\b(deliver(?:y|ies|ed|s)?|shipp?(?:ing|ed|s)?|dispatch(?:ed)?)\b/i, known: /deliver|ship|dispatch|courier|pick-?\s?up|rider/i },
  { label: "refunds / returns", reply: /\b(refund(?:s|ed)?|return policy|money[- ]back|exchange policy)\b/i, known: /refund|return|money[- ]back|exchange/i },
  { label: "warranty / guarantee", reply: /\b(warrant(?:y|ies)|guarantee[ds]?)\b/i, known: /warrant|guarant/i },
  { label: "free offer", reply: /\bfree (?:delivery|shipping|gift|installation|consultation|sample|trial|of charge)\b/i, known: /free|complimentary/i },
  { label: "discount / promo", reply: /\b(discount(?:s|ed)?|promo(?:tion)?s?|\d+\s?% off|percent off)\b/i, known: /discount|promo|sale|% ?off|percent|deal/i },
  // One rule per method: a business that says "pay by bank transfer" has said
  // nothing about mobile money, cash on delivery or instalments.
  { label: "bank transfer payment", reply: /\bbank transfer\b/i, known: /transfer/i },
  { label: "cash on delivery", reply: /\b(cash on delivery|pay on delivery|pay cash)\b/i, known: /cash on delivery|pay on delivery|\bcod\b|pay cash/i },
  { label: "card / POS payment", reply: /\b(card payment|pay by card|pay with card|\bpos\b)\b/i, known: /\bpos\b|\bcard\b/i },
  { label: "mobile money payment", reply: /\bmobile money\b/i, known: /mobile money|momo/i },
  { label: "instalment payment", reply: /\b(instal+ments?|pay later)\b/i, known: /instal+ment|pay later/i },
  { label: "coverage", reply: /\b(nationwide|worldwide|countrywide|all over nigeria|international shipping)\b/i, known: /nationwide|worldwide|countrywide|international|all over/i },
  { label: "speed", reply: /\b(same[- ]day|next[- ]day|24\/7|24[- ]hours?|overnight)\b/i, known: /same[- ]day|next[- ]day|24\/7|24[- ]?hours?|overnight/i },
];

// A question isn't a claim: "Would you like delivery?" asserts nothing.
function assertiveText(reply: string): string {
  return reply
    .split(/(?<=[.!?\n])\s+/)
    .filter((sentence) => !sentence.trim().endsWith("?"))
    .join(" ");
}

// ---- the check -----------------------------------------------------------

export function assessGrounding(input: GroundingInput): GroundingResult {
  const reply = input.reply ?? "";

  if (isFallbackReply(reply, input.businessName)) {
    return { verdict: "low", signals: [{ type: "fallback", value: "Mira said she didn't have that information", supported: false }] };
  }

  const customerText = input.customerMessages.join("\n");
  const knownText = `${input.knowledge}\n${customerText}`;
  const knownLower = knownText.toLowerCase();

  const signals: GroundingSignal[] = [];
  const add = (signal: GroundingSignal) => {
    if (!signals.some((existing) => existing.type === signal.type && existing.value === signal.value)) signals.push(signal);
  };

  let work = reply;

  // 1. contact details and links first, then blank them out so their digits
  //    and dots can't be mistaken for prices or times.
  const knownEmails = new Set((knownText.match(EMAIL_REGEX) ?? []).map((e) => e.toLowerCase()));
  work = mask(work, EMAIL_REGEX, (m) => add({ type: "contact", value: m[0], supported: knownEmails.has(m[0].toLowerCase()) }));

  const knownLinkText = knownLower.replace(/https?:\/\//g, "").replace(/www\./g, "");
  work = mask(work, LINK_REGEX, (m) => {
    const normalized = normalizeLink(m[0]);
    if (normalized.length >= 4) add({ type: "link", value: m[0].replace(/[).,;!?]+$/, ""), supported: knownLinkText.includes(normalized) });
  });

  const knownPhones = new Set<string>();
  for (const m of knownText.matchAll(PHONE_REGEX)) {
    const key = phoneKey(m[0]);
    if (key) knownPhones.add(key);
  }
  work = mask(work, PHONE_REGEX, (m) => {
    const key = phoneKey(m[0]);
    if (key) add({ type: "contact", value: m[0].trim(), supported: knownPhones.has(key) });
  });

  // 2. prices
  const knownNumbers = extractAllNumbers(knownText);
  const pricePool = Array.from(new Set(extractPrices(input.knowledge, input.currency).map((p) => p.amount)));
  const multiples = new Set<number>();
  for (const price of pricePool) for (let qty = 1; qty <= 10; qty++) multiples.add(roundMoney(price * qty));

  const isSupportedAmount = (amount: number): boolean => {
    if (knownNumbers.has(amount)) return true;
    // quantity x price, e.g. 2 x 15,000 = 30,000
    for (const price of pricePool) {
      for (let qty = 2; qty <= 100; qty++) if (roundMoney(price * qty) === amount) return true;
    }
    // a total: a few items, plus optionally a known extra such as a delivery fee
    for (const part of multiples) {
      const rest = roundMoney(amount - part);
      // The "known extra" must look like money (a delivery fee, a packaging
      // charge), not an incidental small number such as "5 in stock".
      if (rest >= 100 && (multiples.has(rest) || knownNumbers.has(rest))) return true;
    }
    return false;
  };

  for (const price of extractPrices(work, input.currency)) {
    add({ type: "price", value: price.label, supported: isSupportedAmount(price.amount) });
  }
  work = mask(work, priceRegex(input.currency), () => undefined);
  work = mask(work, PRICE_WORD_AFTER_REGEX, () => undefined);

  // 3. times
  const knownTimes = extractTimes(knownText);
  for (const [minutes, label] of extractTimes(work)) {
    add({ type: "time", value: label, supported: knownTimes.has(minutes) });
  }

  // 4. risky policy claims, from assertions only
  const assertive = assertiveText(reply);
  for (const rule of CLAIM_RULES) {
    if (rule.reply.test(assertive)) add({ type: "claim", value: rule.label, supported: rule.known.test(knownLower) });
  }

  const limited = signals.slice(0, MAX_SIGNALS);
  if (limited.length === 0) return { verdict: "unchecked", signals: [] };

  const hardUnsupported = limited.filter((s) => s.type !== "claim" && !s.supported).length;
  const softUnsupported = limited.filter((s) => s.type === "claim" && !s.supported).length;
  const verdict: GroundingVerdict = hardUnsupported > 0 ? "low" : softUnsupported > 0 ? "medium" : "high";
  return { verdict, signals: limited };
}

// One-line, human wording for the unsupported signals (portal + admin).
export function describeSignal(signal: GroundingSignal): string {
  switch (signal.type) {
    case "price":
      return `Price "${signal.value}" isn't in your business info`;
    case "time":
      return `Time "${signal.value}" doesn't match your hours`;
    case "link":
      return `Link "${signal.value}" isn't in your business info`;
    case "contact":
      return `Contact "${signal.value}" isn't in your business info`;
    case "claim":
      return `Mentions ${signal.value}, which your business info doesn't cover`;
    case "fallback":
      return signal.value;
  }
}
