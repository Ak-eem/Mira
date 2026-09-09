-- claimed_by/claimed_at were added directly in production via the SQL
-- editor as an emergency fix (app/api/chat/route.ts and the WhatsApp
-- webhook shipped a dependency on these columns without a migration to
-- create them, which broke all web chat until this was run manually).
-- This migration exists so the columns are also created on any fresh
-- environment -- `if not exists` makes it a no-op against production,
-- which already has them.
alter table conversations
  add column if not exists claimed_by text,
  add column if not exists claimed_at timestamptz;

create index if not exists idx_conversations_claimed_by
  on conversations (business_id)
  where claimed_by is not null;
