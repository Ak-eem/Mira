-- Contact/social links a business wants Mira to hand out to customers
-- (e.g. "message us on WhatsApp", "follow us on Instagram"). A single
-- jsonb column rather than one column per platform: whichever platforms
-- are relevant is up to the business, and adding a new one later (the
-- Settings UI currently offers whatsapp/instagram/facebook/tiktok/
-- website) is a UI change, not another migration.
alter table businesses
  add column social_links jsonb not null default '{}'::jsonb;
