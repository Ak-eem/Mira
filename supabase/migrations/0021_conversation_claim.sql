-- Supports an operator explicitly "taking over" a conversation, distinct
-- from just being flagged (needs_human). Flagged-but-unclaimed still gets
-- Mira's polite "added to what the team can see" acknowledgment; once
-- claimed, Mira goes fully silent and it's a real human<->customer thread
-- until the operator hands it back or ends it.
alter table conversations
  add column claimed_by text,
  add column claimed_at timestamptz;

create index idx_conversations_claimed_by
  on conversations (business_id)
  where claimed_by is not null;
