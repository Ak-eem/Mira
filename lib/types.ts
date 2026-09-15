export type BusinessSocialLinks = {
  whatsapp?: string;
  instagram?: string;
  facebook?: string;
  tiktok?: string;
  website?: string;
};

export type BusinessTheme = {
  primary: string;
  secondary: string;
  surface: string;
  text: string;
};

export const defaultTheme: BusinessTheme = {
  primary: "#0f766e",
  secondary: "#14b8a6",
  surface: "#f0fdfa",
  text: "#134e4a",
};

const THEME_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

export function normalizeTheme(value: unknown): BusinessTheme {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    primary: typeof input.primary === "string" && THEME_COLOR_PATTERN.test(input.primary) ? input.primary : defaultTheme.primary,
    secondary: typeof input.secondary === "string" && THEME_COLOR_PATTERN.test(input.secondary) ? input.secondary : defaultTheme.secondary,
    surface: typeof input.surface === "string" && THEME_COLOR_PATTERN.test(input.surface) ? input.surface : defaultTheme.surface,
    text: typeof input.text === "string" && THEME_COLOR_PATTERN.test(input.text) ? input.text : defaultTheme.text,
  };
}

export type Business = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  currency: string;
  timezone: string;
  ai_tone: string | null;
  ai_instructions: string | null;
  hours_note: string | null;
  whatsapp_phone_number_id: string | null;
  social_links: BusinessSocialLinks;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type Service = {
  id: string;
  business_id: string;
  name: string;
  description: string | null;
  price: number | null;
  is_available: boolean;
  availability_note: string | null;
  created_at: string;
  updated_at: string;
};

export type Product = {
  id: string;
  business_id: string;
  name: string;
  description: string | null;
  price: number;
  stock_quantity: number | null;
  is_available: boolean;
  availability_note: string | null;
  created_at: string;
  updated_at: string;
};
