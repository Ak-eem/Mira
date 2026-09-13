create table ai_response_telemetry (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete set null,
  message_id uuid references messages(id) on delete set null,
  channel text not null default 'web' check (channel in ('web', 'whatsapp')),
  provider text not null check (provider in ('groq', 'gemini')),
  fallback_from text check (fallback_from in ('groq', 'gemini')),
  success boolean not null,
  latency_ms integer not null check (latency_ms >= 0),
  input_tokens integer,
  output_tokens integer,
  error_code text,
  created_at timestamptz not null default now()
);

create index idx_ai_response_telemetry_platform_date
  on ai_response_telemetry(created_at desc);
create index idx_ai_response_telemetry_business_date
  on ai_response_telemetry(business_id, created_at desc);
create index idx_ai_response_telemetry_provider_date
  on ai_response_telemetry(provider, created_at desc);

alter table ai_response_telemetry enable row level security;

create policy "admins read ai response telemetry" on ai_response_telemetry
  for select using (is_platform_admin());
create policy "owners read own ai response telemetry" on ai_response_telemetry
  for select using (is_business_owner(business_id));

create policy "owners read own activity_log" on activity_log
  for select using (is_business_owner(business_id));
create policy "owners read own message_feedback" on message_feedback
  for select using (
    exists (
      select 1 from messages
      where messages.id = message_feedback.message_id
        and is_business_owner(messages.business_id)
    )
  );