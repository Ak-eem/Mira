alter table conversations
  add column if not exists owner_read_at timestamptz;

create index if not exists idx_conversations_owner_unread
  on conversations (business_id, owner_read_at)
  where owner_read_at is null;

create table if not exists system_health_checks (
  check_name text primary key,
  checked_at timestamptz not null default now()
);

alter table system_health_checks enable row level security;

drop policy if exists "admins read system health checks" on system_health_checks;
create policy "admins read system health checks"
  on system_health_checks for select
  using (is_platform_admin());

drop policy if exists "service role records system health checks" on system_health_checks;
create policy "service role records system health checks"
  on system_health_checks for all
  using (is_platform_admin())
  with check (is_platform_admin());