create table if not exists rate_limit_buckets (
  key text primary key,
  window_started timestamptz not null default now(),
  request_count integer not null default 0,
  updated_at timestamptz not null default now()
);
create or replace function consume_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql security definer set search_path = public as $$
declare started timestamptz; count_now integer;
begin
  select window_started, request_count into started, count_now from rate_limit_buckets where key = p_key for update;
  if not found then insert into rate_limit_buckets(key, request_count) values (p_key, 1); return query select true, 0; end if;
  if started + make_interval(secs => p_window_seconds) <= now() then update rate_limit_buckets set window_started = now(), request_count = 1, updated_at = now() where key = p_key; return query select true, 0;
  elsif count_now >= p_limit then return query select false, greatest(1, ceil(extract(epoch from (started + make_interval(secs => p_window_seconds) - now())))::integer);
  else update rate_limit_buckets set request_count = request_count + 1, updated_at = now() where key = p_key; return query select true, 0;
  end if;
end; $$;
grant execute on function consume_rate_limit(text, integer, integer) to service_role;
create table if not exists conversation_processing_leases (
  conversation_key text primary key,
  lease_token uuid not null,
  acquired_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create table if not exists whatsapp_inbound_queue (
  id uuid primary key default gen_random_uuid(),
  message_id text not null,
  waba_phone_number_id text not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending','processing','done','failed')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (message_id, waba_phone_number_id)
);
create index if not exists whatsapp_inbound_queue_available_idx on whatsapp_inbound_queue(status, available_at);
