-- Supports an operator explicitly "taking over" a conversation, distinct
-- from just being flagged (needs_human). Flagged-but-unclaimed still gets
-- Mira's polite "added to what the team can see" acknowledgment; once
-- claimed, Mira goes fully silent and it's a real human<->customer thread
-- until the operator hands it back or ends it.
alter table conversations add column if not exists claimed_by text;
alter table conversations add column if not exists claimed_at timestamptz;

create index if not exists idx_conversations_claimed_by
  on conversations (business_id)
  where claimed_by is not null;
