create table message_feedback (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null unique references messages(id) on delete cascade,
  rating text not null check (rating in ('up', 'down')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_message_feedback_message on message_feedback(message_id);

-- Written only via the service-role client from app/api/feedback (the
-- customer-facing chat has no identity to check an RLS policy against,
-- same trust model as messages/conversations already have). RLS is still
-- enabled and admin-read is still policy-gated, same as everywhere else.
alter table message_feedback enable row level security;

create policy "admins read message feedback" on message_feedback for select
  using (is_platform_admin());
