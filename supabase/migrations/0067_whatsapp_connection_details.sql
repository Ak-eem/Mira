-- businesses.whatsapp_phone_number_id already has its unique index.
-- Webhook tenant lookup will use phone_number_id metadata, so that index matters.
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS whatsapp_waba_id text,
  ADD COLUMN IF NOT EXISTS whatsapp_display_phone_number text,
  ADD COLUMN IF NOT EXISTS whatsapp_connected_at timestamptz,
  ADD COLUMN IF NOT EXISTS whatsapp_status text;
