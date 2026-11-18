import { buildContactLinks, type ContactLink } from "@/lib/contactLinks";
import { WEEKDAY_NAMES, WEEKDAY_SHORT_TO_INDEX, formatTime, type HoursRow } from "@/lib/hours";
import type { BusinessSocialLinks } from "@/lib/types";

// The "about" section at the top of the full-screen business page (the link people open from an
// Instagram bio): what the business is, whether it is open today, where else to find it, and what it
// sells. Built on the server from the business's own data, so the page component only draws it.
export type ProfileProduct = { id: string; name: string; priceLabel: string; imageUrl: string | null };
export type WeekRow = { day: string; hours: string; today: boolean };
export type BusinessProfile = {
  description: string | null;
  hoursToday: string | null;
  links: ContactLink[];
  products: ProfileProduct[];
  // The rest only appears in the left-hand panel on a wide screen.
  week: WeekRow[] | null;
  promotions: string[];
  faqs: string[];
  policies: string[];
};

export const MAX_PROFILE_PRODUCTS = 6;
export const MAX_DESCRIPTION_LENGTH = 280;
export const MAX_PROMOTIONS = 3;
export const MAX_FAQS = 5;
export const MAX_POLICIES = 5;
const MAX_PROMOTION_LENGTH = 160;
const MIN_FAQ_LENGTH = 4;
const MAX_FAQ_LENGTH = 80;

// Monday first, the way a week is read on a shop door.
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

function dayIndexIn(timezone: string, now: Date): number | null {
  try {
    return WEEKDAY_SHORT_TO_INDEX[new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" }).format(now)] ?? null;
  } catch {
    return null;
  }
}

function rangesFor(hours: HoursRow[], day: number): string[] {
  return hours
    .filter((row) => row.day_of_week === day && row.opens_at && row.closes_at)
    .sort((a, b) => String(a.opens_at).localeCompare(String(b.opens_at)))
    .map((row) => `${formatTime(row.opens_at)} – ${formatTime(row.closes_at)}`);
}

// The whole week, with today flagged in the business's own timezone. null when no hours are set.
export function weeklyHours(hours: HoursRow[], timezone: string, now: Date = new Date()): WeekRow[] | null {
  if (!hours.some((row) => row.opens_at && row.closes_at)) return null;
  const today = dayIndexIn(timezone, now);
  if (today === null) return null;
  return WEEK_ORDER.map((day) => {
    const ranges = rangesFor(hours, day);
    return { day: WEEKDAY_NAMES[day], hours: ranges.length > 0 ? ranges.join(", ") : "Closed", today: day === today };
  });
}

// "9:00 AM – 6:00 PM" for today in the business's own timezone, "Closed today" when hours are set for
// other days but not today, and null when the business has not set any hours (we do not know, so say nothing).
export function hoursTodayLabel(hours: HoursRow[], timezone: string, now: Date = new Date()): string | null {
  if (!hours.some((row) => row.opens_at && row.closes_at)) return null;
  const today = dayIndexIn(timezone, now);
  if (today === null) return null;
  const ranges = rangesFor(hours, today);
  return ranges.length > 0 ? ranges.join(", ") : "Closed today";
}

export function formatPrice(price: number | string, currency: string): string {
  const amount = Number(price);
  if (!Number.isFinite(amount)) return "";
  try {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency,
      // Whole amounts have no decimals ("₦2,500"); anything else always shows two ("US$12.50").
      minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString("en-US")}`;
  }
}

// Links come from what the owner typed in Settings. buildContactLinks gives them a scheme (anything that
// is not http(s) ends up as an inert "https://javascript:..." value), and this drops whatever still does
// not parse as a real web address, so a garbage value never becomes a button.
function isWebAddress(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && url.hostname.includes(".");
  } catch {
    return false;
  }
}

function clamp(text: string, max: number): string | null {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return null;
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 40)).trimEnd()}…`;
}

// An offer shows while it is active and today falls inside its dates (either end may be open).
function isRunning(promotion: { starts_at: string | null; ends_at: string | null }, now: Date): boolean {
  const starts = promotion.starts_at ? new Date(promotion.starts_at).getTime() : null;
  const ends = promotion.ends_at ? new Date(promotion.ends_at).getTime() : null;
  return (starts === null || Number.isNaN(starts) || starts <= now.getTime()) && (ends === null || Number.isNaN(ends) || ends >= now.getTime());
}

export type ProfileInput = {
  description: string | null | undefined;
  currency: string | null | undefined;
  timezone: string;
  socialLinks: BusinessSocialLinks | null | undefined;
  hours: HoursRow[];
  products: { id: string; name: string; price: number | string | null; image_url: string | null }[];
  promotions?: { description: string; starts_at: string | null; ends_at: string | null }[];
  faqs?: { question: string }[];
  policies?: { title: string }[];
  now?: Date;
};

// null when there is nothing to show, so a business with no details gets the plain chat page.
export function buildProfile(input: ProfileInput): BusinessProfile | null {
  const currency = input.currency || "NGN";
  const products: ProfileProduct[] = input.products
    .filter((p) => p.name?.trim() && p.price !== null && Number.isFinite(Number(p.price)))
    .slice(0, MAX_PROFILE_PRODUCTS)
    .map((p) => ({
      id: p.id,
      name: p.name.trim(),
      priceLabel: formatPrice(p.price as number | string, currency),
      imageUrl: p.image_url && /^https?:\/\//i.test(p.image_url) ? p.image_url : null,
    }));
  const now = input.now ?? new Date();
  const profile: BusinessProfile = {
    description: input.description ? clamp(input.description, MAX_DESCRIPTION_LENGTH) : null,
    hoursToday: hoursTodayLabel(input.hours, input.timezone, now),
    links: buildContactLinks(input.socialLinks).filter((link) => isWebAddress(link.url)),
    products,
    week: weeklyHours(input.hours, input.timezone, now),
    promotions: (input.promotions ?? [])
      .filter((promotion) => isRunning(promotion, now))
      .map((promotion) => clamp(promotion.description, MAX_PROMOTION_LENGTH))
      .filter((text): text is string => text !== null)
      .slice(0, MAX_PROMOTIONS),
    faqs: (input.faqs ?? [])
      .map((faq) => faq.question.replace(/\s+/g, " ").trim())
      .filter((question) => question.length >= MIN_FAQ_LENGTH && question.length <= MAX_FAQ_LENGTH)
      .slice(0, MAX_FAQS),
    policies: (input.policies ?? [])
      .map((policy) => policy.title.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .slice(0, MAX_POLICIES),
  };
  const empty =
    !profile.description && !profile.hoursToday && profile.links.length === 0 && products.length === 0 &&
    profile.promotions.length === 0 && profile.faqs.length === 0 && profile.policies.length === 0;
  return empty ? null : profile;
}
