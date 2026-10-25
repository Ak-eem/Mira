// One-line description of a scraped draft so an owner can review dozens of
// them at a glance instead of reading raw JSON. Field names match what
// lib/ai/extractBusinessInfo.ts validates for each kind. Anything
// unrecognised falls back to a generic label (the full payload is always
// available behind "Details" in the UI), so a new kind never renders blank.

export type DraftSummary = { title: string; detail: string | null };

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function clip(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
}

function priceText(value: unknown): string | null {
  return typeof value === "number" && Number.isFinite(value) ? value.toLocaleString("en-NG") : null;
}

export function summarizeDraft(kind: string, payload: unknown): DraftSummary {
  const p = payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>) : {};

  if (kind === "product" || kind === "service") {
    const price = priceText(p.price);
    const description = str(p.description);
    return {
      title: str(p.name) ?? (kind === "product" ? "Unnamed product" : "Unnamed service"),
      detail: [price ? `Price ${price}` : null, description ? clip(description, 100) : null].filter(Boolean).join(" · ") || null,
    };
  }
  if (kind === "faq") {
    const answer = str(p.answer);
    return { title: str(p.question) ?? "Question", detail: answer ? clip(answer, 120) : null };
  }
  if (kind === "policy") {
    const content = str(p.content);
    return { title: str(p.title) ?? "Policy", detail: content ? clip(content, 120) : null };
  }
  if (kind === "business_hours") {
    const day = typeof p.day_of_week === "number" && Number.isInteger(p.day_of_week) ? DAYS[p.day_of_week] : undefined;
    const opens = str(p.opens_at);
    const closes = str(p.closes_at);
    return { title: day ?? "Opening hours", detail: opens && closes ? `${opens} – ${closes}` : "Closed" };
  }
  return { title: str(p.name) ?? str(p.title) ?? "Suggested item", detail: null };
}
