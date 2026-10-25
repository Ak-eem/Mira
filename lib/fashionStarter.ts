// Turns a fashion store owner's setup answers into starter FAQs and a returns
// policy. Pure (no I/O) so every rule is tested in fashionStarter.test.ts.
//
// Mira repeats FAQ and policy text to customers as fact, so this NEVER invents a
// business rule: an item is only produced from something the owner actually
// answered, and a question left blank produces nothing. The wording is
// deliberately short because Mira's FAQ context is capped (SECTION_LIMITS.faqs
// in lib/ai/buildContext.ts); the test below guards that budget.

export type ReturnsPolicy = "none" | "exchange" | "returns";
export type PaymentMethod = "transfer" | "card" | "cod";

export type FashionAnswers = {
  madeToMeasure: boolean | null;
  returns: ReturnsPolicy | null;
  returnDays: number | null;
  deliveryNote: string;
  payments: PaymentMethod[];
};

export const EMPTY_FASHION_ANSWERS: FashionAnswers = {
  madeToMeasure: null,
  returns: null,
  returnDays: null,
  deliveryNote: "",
  payments: [],
};

export const MAX_DELIVERY_NOTE = 140;
export const MAX_RETURN_DAYS = 90;
const PAYMENT_ORDER: PaymentMethod[] = ["transfer", "card", "cod"];
const PAYMENT_LABEL: Record<PaymentMethod, string> = { transfer: "bank transfer", card: "card", cod: "pay on delivery" };

export type StarterItems = {
  faqs: { question: string; answer: string }[];
  policies: { title: string; content: string }[];
};

export type NormalizeFashionResult = { ok: true; answers: FashionAnswers } | { ok: false; error: string };

// One line, no control characters, capped. The owner's own words go into an FAQ
// answer, so keep them to plain text of a sensible size.
export function cleanNote(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_DELIVERY_NOTE);
}

// Validates input from the browser. Unanswered questions are null/empty; anything of
// the wrong type is rejected rather than coerced, like lib/onboarding.ts.
export function normalizeFashionAnswers(input: unknown): NormalizeFashionResult {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return { ok: false, error: "Invalid request." };
  const raw = input as Record<string, unknown>;

  const mtm = raw.madeToMeasure;
  if (mtm !== null && mtm !== undefined && typeof mtm !== "boolean") return { ok: false, error: "Invalid request." };

  const returns = raw.returns;
  if (returns !== null && returns !== undefined && returns !== "none" && returns !== "exchange" && returns !== "returns") {
    return { ok: false, error: "Invalid request." };
  }

  let returnDays: number | null = null;
  if (raw.returnDays !== null && raw.returnDays !== undefined) {
    if (typeof raw.returnDays !== "number" || !Number.isInteger(raw.returnDays) || raw.returnDays < 1 || raw.returnDays > MAX_RETURN_DAYS) {
      return { ok: false, error: `Return window must be a whole number of days from 1 to ${MAX_RETURN_DAYS}.` };
    }
    returnDays = raw.returnDays;
  }

  if (raw.deliveryNote !== undefined && raw.deliveryNote !== null && typeof raw.deliveryNote !== "string") return { ok: false, error: "Invalid request." };

  let payments: PaymentMethod[] = [];
  if (raw.payments !== undefined && raw.payments !== null) {
    if (!Array.isArray(raw.payments) || raw.payments.some((p) => !PAYMENT_ORDER.includes(p as PaymentMethod))) return { ok: false, error: "Invalid request." };
    payments = PAYMENT_ORDER.filter((p) => (raw.payments as unknown[]).includes(p));
  }

  return {
    ok: true,
    answers: {
      madeToMeasure: (mtm as boolean | null | undefined) ?? null,
      returns: (returns as ReturnsPolicy | null | undefined) ?? null,
      // A return window only means something when returns or exchanges are offered.
      returnDays: returns === "exchange" || returns === "returns" ? returnDays : null,
      deliveryNote: cleanNote(typeof raw.deliveryNote === "string" ? raw.deliveryNote : ""),
      payments,
    },
  };
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export function buildFashionStarter(a: FashionAnswers): StarterItems {
  const faqs: StarterItems["faqs"] = [];
  const policies: StarterItems["policies"] = [];

  if (a.madeToMeasure === true) {
    faqs.push({
      question: "Do you make custom or made-to-measure pieces?",
      answer: "Yes. Tell us the style you want and your measurements, and the team will confirm the price and how long it takes.",
    });
  } else if (a.madeToMeasure === false) {
    faqs.push({ question: "Do you make custom or made-to-measure pieces?", answer: "No, we only sell our ready-made pieces." });
  }

  if (a.deliveryNote) faqs.push({ question: "How long does delivery take?", answer: a.deliveryNote });

  if (a.payments.length > 0) faqs.push({ question: "How can I pay?", answer: `You can pay by ${joinList(a.payments.map((p) => PAYMENT_LABEL[p]))}.` });

  if (a.returns === "none") {
    policies.push({ title: "Returns and exchanges", content: "We don't accept returns or exchanges, so please check your size and details before you order." });
  } else if (a.returns === "exchange") {
    policies.push({
      title: "Returns and exchanges",
      content: `We exchange items${a.returnDays ? ` within ${a.returnDays} days of delivery` : ""} but don't give refunds.`,
    });
  } else if (a.returns === "returns") {
    policies.push({
      title: "Returns and exchanges",
      content: a.returnDays ? `We accept returns and exchanges within ${a.returnDays} days of delivery.` : "We accept returns and exchanges. Ask the team for the details.",
    });
  }

  return { faqs, policies };
}

export function hasAnyFashionAnswer(a: FashionAnswers): boolean {
  return a.madeToMeasure !== null || a.returns !== null || a.deliveryNote !== "" || a.payments.length > 0;
}
