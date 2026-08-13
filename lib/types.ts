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
