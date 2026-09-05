import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { WEEKDAY_NAMES, formatTime, isOpenNow } from "@/lib/hours";
import { buildContactLinks } from "@/lib/contactLinks";

const MAX_CONTEXT_CHARS = 6000;
const CONTEXT_TTL_MS = 60_000;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SECTION_LIMITS = {
  business: 450,
  contact: 300,
  services: 1100,
  products: 1500,
  hours: 800,
  promotions: 400,
  closures: 300,
  faqs: 900,
  policies: 550,
} as const;

type CachedContext = {
  expiresAt: number;
  value: BusinessContext;
};

const contextCache = new Map<string, CachedContext>();

export type BusinessContext = {
  found: boolean;
  business?: {
    name: string;
    currency: string;
    ai_tone: string | null;
    ai_instructions: string | null;
  };
  contextText: string;
  products: { id: string; name: string; image_url: string | null }[];
};

/**
 * Sanitizes user-configurable business text fields to prevent tag-injection
 * or boundary breaking inside the AI prompt.
 */
function sanitizeText(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .replace(/<\/?(?:BUSINESS_KNOWLEDGE_BASE|SYSTEM|INSTRUCTIONS|PROMPT|USER)[^>]*>/gi, "")
    .trim();
}

function truncateLines(lines: string[], maxChars: number): string {
  const kept: string[] = [];
  let length = 0;

  for (const line of lines) {
    const nextLength = length + (kept.length > 0 ? 1 : 0) + line.length;
    if (nextLength > maxChars) break;
    kept.push(line);
    length = nextLength;
  }

  if (kept.length < lines.length && maxChars - length >= 18) {
    kept.push("… (more entries omitted)");
  }

  return kept.join("\n");
}

function section(title: string, lines: string[], maxChars: number): { title: string; text: string } {
  return { title, text: `${title}:\n${truncateLines(lines, maxChars)}` };
}

function fitContext(
  sections: { title: string; text: string }[],
  businessId: string,
): string {
  const lines: string[] = [];
  const droppedTitles: string[] = [];
  let length = 0;

  for (let i = 0; i < sections.length; i += 1) {
    const { title, text } = sections[i];
    const nextLength = length + (lines.length > 0 ? 2 : 0) + text.length;

    if (nextLength <= MAX_CONTEXT_CHARS) {
      lines.push(text);
      length = nextLength;
      continue;
    }

    const remaining = MAX_CONTEXT_CHARS - length - (lines.length > 0 ? 2 : 0);
    if (remaining >= 18) {
      lines.push(truncateLines(text.split("\n"), remaining));
    } else {
      droppedTitles.push(title);
    }
    for (let j = i + 1; j < sections.length; j += 1) droppedTitles.push(sections[j].title);
    break;
  }

  if (droppedTitles.length > 0) {
    console.warn(
      `[buildContext] business ${businessId}: context exceeded ${MAX_CONTEXT_CHARS} chars, dropped section(s): ${droppedTitles.join(", ")}`,
    );
  }

  return lines.join("\n\n").slice(0, MAX_CONTEXT_CHARS);
}

/**
 * Builds business context scoped strictly to `businessId`.
 *
 * TENANT ISOLATION GUARANTEE:
 * All database queries are explicitly filtered at the query level by `.eq("business_id", businessId)`
 * or `.eq("id", businessId)`. No external parameter or customer message can alter these query filters.
 */
export async function buildBusinessContext(
  businessId: string,
): Promise<BusinessContext> {
  // Validate UUID format to reject malformed identifiers before running queries
  if (!businessId || !UUID_REGEX.test(businessId)) {
    return { found: false, contextText: "", products: [] };
  }

  const cached = contextCache.get(businessId);
  if (cached) {
    if (cached.expiresAt > Date.now()) return cached.value;
    contextCache.delete(businessId);
  }

  const supabase = createServiceRoleClient();

  // All queries below explicitly scope results to `businessId`
  const [
    { data: business },
    { data: services },
    { data: products },
    { data: hours },
    { data: allPromotions },
    { data: allClosures },
    { data: faqs },
    { data: policies },
  ] = await Promise.all([
    supabase
      .from("businesses")
      .select("id,name,currency,timezone,ai_tone,ai_instructions,hours_note,social_links")
      .eq("id", businessId)
      .eq("is_active", true)
      .maybeSingle(),
    supabase
      .from("services")
      .select("name,description,price,is_available,availability_note")
      .eq("business_id", businessId)
      .limit(30),
    supabase
      .from("products")
      .select(
        "id,name,description,price,stock_quantity,is_available,availability_note,image_url",
      )
      .eq("business_id", businessId)
      .limit(50),
    supabase
      .from("business_hours")
      .select("day_of_week,opens_at,closes_at")
      .eq("business_id", businessId),
    supabase
      .from("promotions")
      .select("description,starts_at,ends_at,is_active")
      .eq("business_id", businessId)
      .eq("is_active", true),
    supabase
      .from("closures")
      .select("starts_at,ends_at,reason")
      .eq("business_id", businessId),
    supabase
      .from("faqs")
      .select("question,answer")
      .eq("business_id", businessId)
      .eq("is_active", true)
      .limit(20),
    supabase
      .from("policies")
      .select("title,content")
      .eq("business_id", businessId)
      .eq("is_active", true),
  ]);

  if (!business) {
    const value: BusinessContext = { found: false, contextText: "", products: [] };
    contextCache.set(businessId, { expiresAt: Date.now() + CONTEXT_TTL_MS, value });
    return value;
  }

  const now = new Date();
  const activePromotions = (allPromotions ?? []).filter((promotion) => {
    const started = !promotion.starts_at || new Date(promotion.starts_at) <= now;
    const notEnded = !promotion.ends_at || new Date(promotion.ends_at) >= now;
    return started && notEnded;
  });
  const currentClosures = (allClosures ?? []).filter(
    (closure) =>
      new Date(closure.starts_at) <= now && new Date(closure.ends_at) >= now,
  );
  const openNow = isOpenNow(hours ?? [], business.timezone);
  const currency = business.currency;

  const sanitizedTone = sanitizeText(business.ai_tone);
  const sanitizedInstructions = sanitizeText(business.ai_instructions);

  const serviceLines = (services ?? []).map((service) => {
    const price = service.price != null ? `${currency} ${service.price}` : "price on request";
    const availability = service.is_available
      ? "available"
      : `unavailable${service.availability_note ? ` — ${service.availability_note}` : ""}`;
    return `- ${service.name}: ${price} (${availability})${service.description ? ` — ${service.description}` : ""}`;
  });
  const productLines = (products ?? []).map((product) => {
    const stock =
      product.stock_quantity == null
        ? ""
        : product.stock_quantity > 0
          ? `, ${product.stock_quantity} in stock`
          : ", OUT OF STOCK";
    const availability = product.is_available
      ? `available${stock}`
      : `unavailable${product.availability_note ? ` — ${product.availability_note}` : ""}`;
    const photo = product.image_url ? " [has photo]" : "";
    return `- ${product.name}: ${currency} ${product.price} (${availability})${product.description ? ` — ${product.description}` : ""}${photo}`;
  });
  const hoursLines: string[] = [];

  for (let day = 0; day < 7; day += 1) {
    const row = (hours ?? []).find((item) => item.day_of_week === day);
    if (!row || !row.opens_at || !row.closes_at) {
      hoursLines.push(`- ${WEEKDAY_NAMES[day]}: closed`);
    } else {
      hoursLines.push(`- ${WEEKDAY_NAMES[day]}: ${formatTime(row.opens_at)}-${formatTime(row.closes_at)}`);
    }
  }
  hoursLines.push(`Currently: ${openNow ? "OPEN" : "CLOSED"} (${business.timezone})`);
  if (business.hours_note) hoursLines.push(`Note: ${business.hours_note}`);

  const contactLinks = buildContactLinks(business.social_links);

  const sections = [
    section("Business", [
      `Name: ${business.name}`,
      `Currency: ${currency}`,
      ...(sanitizedTone ? [`Tone: ${sanitizedTone}`] : []),
      ...(sanitizedInstructions ? [`Custom Guidance: ${sanitizedInstructions}`] : []),
    ], SECTION_LIMITS.business),
    section(
      "Contact & social links",
      contactLinks.length > 0
        ? contactLinks.map((link) => `- ${link.label}: ${link.url}`)
        : ["(none configured)"],
      SECTION_LIMITS.contact,
    ),
    section("Hours", hoursLines, SECTION_LIMITS.hours),
    section("Services", serviceLines.length > 0 ? serviceLines : ["(none listed)"], SECTION_LIMITS.services),
    section("Products", productLines.length > 0 ? productLines : ["(none listed)"], SECTION_LIMITS.products),
    section(
      "Active promotions",
      activePromotions.length > 0 ? activePromotions.map((promotion) => `- ${promotion.description}`) : ["(none)"],
      SECTION_LIMITS.promotions,
    ),
    section(
      "Current closures",
      currentClosures.length > 0 ? currentClosures.map((closure) => `- ${closure.reason ?? "Temporarily closed"}`) : ["(none)"],
      SECTION_LIMITS.closures,
    ),
    section(
      "FAQs",
      (faqs ?? []).length > 0 ? (faqs ?? []).map((faq) => `Q: ${faq.question}\nA: ${faq.answer}`) : ["(none)"],
      SECTION_LIMITS.faqs,
    ),
    section(
      "Policies",
      (policies ?? []).map((policy) => `${policy.title}:\n${policy.content}`).length > 0
        ? (policies ?? []).map((policy) => `${policy.title}:\n${policy.content}`)
        : ["(none)"],
      SECTION_LIMITS.policies,
    ),
  ];

  const value: BusinessContext = {
    found: true,
    business: {
      name: business.name,
      currency: business.currency,
      ai_tone: sanitizedTone || null,
      ai_instructions: sanitizedInstructions || null,
    },
    contextText: fitContext(sections, businessId),
    products: (products ?? []).map((p) => ({ id: p.id, name: p.name, image_url: p.image_url })),
  };

  contextCache.set(businessId, { expiresAt: Date.now() + CONTEXT_TTL_MS, value });
  return value;
}
