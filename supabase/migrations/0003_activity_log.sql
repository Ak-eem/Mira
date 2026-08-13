-- A simple activity log, not an event-sourcing system: each row is a
-- single pre-formatted, human-readable line (the same source that
-- constructs the message already has the old/new values right there),
-- rather than generic structured diffing across seven different entity
-- shapes. source is ready for Command Center writes too, once that exists.

create table activity_log (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  entity_type text not null,   -- 'service' | 'promotion' | 'closure' | 'faq' | 'policy' | 'hours' | 'business'
  entity_id uuid,               -- nullable: hours/business settings aren't a single row the same way
  action text not null,         -- 'created' | 'updated' | 'deleted'
  summary text not null,
  source text not null default 'admin_ui', -- 'admin_ui' | 'command_center'
  created_at timestamptz not null default now()
);
create index idx_activity_log_business on activity_log(business_id, created_at desc);

alter table activity_log enable row level security;

create policy "admins manage activity_log" on activity_log for all
  using (is_platform_admin()) with check (is_platform_admin());
