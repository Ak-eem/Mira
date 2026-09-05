-- Additive follow-up to 0021. Do not edit 0021 after it has been applied.
-- Reservations are rolled back when the provider rejects delivery. Counters are
-- tracked in one transaction so IP, provider, and global limits are atomic.
alter table public.email_verification_codes
  add column if not exists flow_token_hash text,
  add column if not exists request_ip inet,
  add column if not exists provider text not null default 'resend';

create table if not exists public.email_verification_rate_limits (
  bucket_key text primary key,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0)
);
alter table public.email_verification_rate_limits enable row level security;
revoke all on public.email_verification_rate_limits from anon, authenticated;

-- Replace the old four-argument function with an additive, flow-aware version.
drop function if exists public.issue_email_verification(text, text, timestamptz, integer);
create or replace function public.issue_email_verification(
  p_email text,
  p_code_hash text,
  p_expires_at timestamptz,
  p_max_hourly_sends integer default 5,
  p_ip inet default null,
  p_flow_token_hash text default null
)
returns table(allowed boolean, reason text, retry_after_seconds integer, code_id uuid)
language plpgsql security definer set search_path = public
as $$
declare
  v_email text := lower(trim(p_email));
  v_now timestamptz := now();
  v_latest public.email_verification_codes%rowtype;
  v_hourly_count integer := 0;
  v_oldest timestamptz;
  v_bucket record;
  v_key text;
begin
  if v_email = '' or p_code_hash = '' then raise exception 'email and code hash are required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('email_verification_rate_limits', 0));

  select * into v_latest from public.email_verification_codes
    where email = v_email and consumed_at is null and invalidated_at is null
    order by created_at desc limit 1 for update;
  if v_latest.id is not null and v_latest.sent_at > v_now - interval '60 seconds' then
    return query select false, 'cooldown', greatest(1, ceil(extract(epoch from (v_latest.sent_at + interval '60 seconds' - v_now)))::integer), null::uuid; return;
  end if;

  select count(*)::integer, min(created_at) into v_hourly_count, v_oldest
    from public.email_verification_codes where email = v_email and created_at > v_now - interval '1 hour';
  if v_hourly_count >= greatest(1, coalesce(p_max_hourly_sends, 5)) then
    return query select false, 'hourly_rate_limit', greatest(1, ceil(extract(epoch from (v_oldest + interval '1 hour' - v_now)))::integer), null::uuid; return;
  end if;

  foreach v_key in array array['global', 'provider:resend'] || case when p_ip is null then array[]::text[] else array['ip:' || host(p_ip)] end loop
    select * into v_bucket from public.email_verification_rate_limits where bucket_key = v_key for update;
    if v_bucket.bucket_key is not null and v_bucket.window_started_at <= v_now - interval '1 hour' then
      update public.email_verification_rate_limits set window_started_at = v_now, request_count = 0 where bucket_key = v_key;
      v_bucket.request_count := 0;
    end if;
    if v_bucket.bucket_key is not null and v_bucket.request_count >= case when v_key = 'global' then 1000 when v_key = 'provider:resend' then 500 else 20 end then
      return query select false,
        case when v_key = 'global' then 'global_rate_limit' when v_key = 'provider:resend' then 'provider_rate_limit' else 'hourly_rate_limit' end,
        greatest(1, ceil(extract(epoch from (coalesce(v_bucket.window_started_at, v_now) + interval '1 hour' - v_now)))::integer), null::uuid; return;
    end if;
  end loop;

  update public.email_verification_codes set invalidated_at = v_now
    where email = v_email and consumed_at is null and invalidated_at is null;
  insert into public.email_verification_codes(email, code_hash, expires_at, flow_token_hash, request_ip, provider)
    values(v_email, p_code_hash, p_expires_at, p_flow_token_hash, p_ip, 'resend') returning id into v_latest.id;
  foreach v_key in array array['global', 'provider:resend'] || case when p_ip is null then array[]::text[] else array['ip:' || host(p_ip)] end loop
    insert into public.email_verification_rate_limits(bucket_key, window_started_at, request_count) values(v_key, v_now, 1)
    on conflict (bucket_key) do update set request_count = case when public.email_verification_rate_limits.window_started_at <= v_now - interval '1 hour' then 1 else public.email_verification_rate_limits.request_count + 1 end, window_started_at = case when public.email_verification_rate_limits.window_started_at <= v_now - interval '1 hour' then v_now else public.email_verification_rate_limits.window_started_at end;
  end loop;
  return query select true, 'sent', null::integer, v_latest.id;
end;
$$;

create or replace function public.release_email_verification(
  p_code_id uuid, p_email text, p_ip inet default null, p_flow_token_hash text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare v_code public.email_verification_codes%rowtype; v_key text;
begin
  perform pg_advisory_xact_lock(hashtextextended('email_verification_rate_limits', 0));
  select * into v_code from public.email_verification_codes where id = p_code_id and email = lower(trim(p_email)) and consumed_at is null for update;
  if v_code.id is null then return; end if;
  if p_flow_token_hash is not null and v_code.flow_token_hash is distinct from p_flow_token_hash then return; end if;
  update public.email_verification_codes set invalidated_at = now() where id = p_code_id;
  foreach v_key in array array['global', 'provider:resend'] || case when p_ip is null then array[]::text[] else array['ip:' || host(p_ip)] end loop
    update public.email_verification_rate_limits set request_count = greatest(0, request_count - 1) where bucket_key = v_key and window_started_at > now() - interval '1 hour';
  end loop;
end;
$$;

-- The old function consumed an OTP without checking the signup flow. The new
-- overload is the only verifier used by the public route and binds the code.
drop function if exists public.verify_email_verification(text, text);
create or replace function public.verify_email_verification(p_email text, p_code_hash text, p_flow_token_hash text)
returns table(success boolean, reason text, attempts_remaining integer)
language plpgsql security definer set search_path = public
as $$
declare v_code public.email_verification_codes%rowtype; v_now timestamptz := now(); v_attempts integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(lower(trim(p_email)), 0));
  select * into v_code from public.email_verification_codes where email = lower(trim(p_email)) and consumed_at is null and invalidated_at is null order by created_at desc limit 1 for update;
  if not found or v_code.flow_token_hash is null or v_code.flow_token_hash is distinct from p_flow_token_hash then return query select false, 'invalid', 0; return; end if;
  if v_code.expires_at <= v_now then update public.email_verification_codes set invalidated_at = v_now where id = v_code.id; return query select false, 'expired', 0; return; end if;
  if v_code.attempts >= 5 then update public.email_verification_codes set invalidated_at = v_now where id = v_code.id; return query select false, 'too_many_attempts', 0; return; end if;
  if v_code.code_hash <> p_code_hash then
    v_attempts := v_code.attempts + 1;
    update public.email_verification_codes set attempts = v_attempts, invalidated_at = case when v_attempts >= 5 then v_now else null end where id = v_code.id;
    return query select false, 'wrong_code', greatest(0, 5 - v_attempts); return;
  end if;
  update public.email_verification_codes set consumed_at = v_now, invalidated_at = v_now where id = v_code.id;
  return query select true, 'verified', 0;
end;
$$;

revoke all on function public.issue_email_verification(text, text, timestamptz, integer, inet, text) from public, anon, authenticated;
revoke all on function public.release_email_verification(uuid, text, inet, text) from public, anon, authenticated;
revoke all on function public.verify_email_verification(text, text, text) from public, anon, authenticated;
grant execute on function public.issue_email_verification(text, text, timestamptz, integer, inet, text) to service_role;
grant execute on function public.release_email_verification(uuid, text, inet, text) to service_role;
grant execute on function public.verify_email_verification(text, text, text) to service_role;
