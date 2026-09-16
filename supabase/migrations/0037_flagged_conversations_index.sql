create index if not exists idx_conversations_flagged_queue
  on conversations (needs_human, claimed_by, started_at)
  where needs_human = true and claimed_by is null;