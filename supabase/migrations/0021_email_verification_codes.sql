-- Secure, server-only storage for custom email verification OTPs.
create table if not exists public.email_verification_codes (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  code_hash text not null,
  attempts integer not null default 0 check (attempts between 0 and 5),
  expires_at timestamptz not null,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  consumed_at timestamptz,
  invalidated_at timestamptz
);

create index if not exists email_verification_codes_email_created_idx
  on public.email_verification_codes (email, created_at desc);

alter table public.email_verification_codes enable row level security;
revoke all on public.email_verification_codes from anon, authenticated;

drop function if exists public.issue_email_verification(text, text, timestamptz, integer);
create or replace function public.issue_email_verification(
  p_email text,
  p_code_hash text,
  p_expires_at timestamptz,
  p_max_hourly_sends integer default 5
)
returns table (
  allowed boolean,
  reason text,
  retry_after_seconds integer,
  code_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(p_email));
  v_now timestamptz := now();
  v_latest public.email_verification_codes%rowtype;
  v_hourly_count integer;
  v_oldest_created_at timestamptz;
  v_code_id uuid;
  v_retry integer;
begin
  if v_email = '' or p_code_hash = '' then
    raise exception 'email and code hash are required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_email, 0));

  select * into v_latest
  from public.email_verification_codes
  where email = v_email
    and consumed_at is null
    and invalidated_at is null
  order by created_at desc
  limit 1
  for update;

  select count(*)::integer, min(created_at)
    into v_hourly_count, v_oldest_created_at
  from public.email_verification_codes
  where email = v_email
    and created_at > v_now - interval '1 hour';

  if v_hourly_count >= greatest(1, coalesce(p_max_hourly_sends, 5)) then
    v_retry := greatest(1, ceil(extract(epoch from (v_oldest_created_at + interval '1 hour' - v_now)))::integer);
    return query select false, 'hourly_rate_limit', v_retry, null::uuid;
    return;
  end if;

  if v_latest.id is not null and v_latest.sent_at > v_now - interval '60 seconds' then
    v_retry := greatest(1, ceil(extract(epoch from (v_latest.sent_at + interval '60 seconds' - v_now)))::integer);
    return query select false, 'cooldown', v_retry, null::uuid;
    return;
  end if;

  update public.email_verification_codes
  set invalidated_at = v_now
  where email = v_email
    and consumed_at is null
    and invalidated_at is null;

  insert into public.email_verification_codes (email, code_hash, expires_at)
  values (v_email, p_code_hash, p_expires_at)
  returning id into v_code_id;

  return query select true, 'sent', null::integer, v_code_id;
end;
$$;

drop function if exists public.verify_email_verification(text, text);
create or replace function public.verify_email_verification(
  p_email text,
  p_code_hash text
)
returns table (
  success boolean,
  reason text,
  attempts_remaining integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(p_email));
  v_now timestamptz := now();
  v_code public.email_verification_codes%rowtype;
  v_attempts integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(v_email, 0));

  select * into v_code
  from public.email_verification_codes
  where email = v_email
    and consumed_at is null
    and invalidated_at is null
  order by created_at desc
  limit 1
  for update;

  if not found then
    return query select false, 'invalid', 0;
    return;
  end if;

  if v_code.expires_at <= v_now then
    update public.email_verification_codes
    set invalidated_at = v_now
    where id = v_code.id;
    return query select false, 'expired', 0;
    return;
  end if;

  if v_code.attempts >= 5 then
    update public.email_verification_codes
    set invalidated_at = v_now
    where id = v_code.id;
    return query select false, 'too_many_attempts', 0;
    return;
  end if;

  if v_code.code_hash <> p_code_hash then
    v_attempts := v_code.attempts + 1;
    update public.email_verification_codes
    set attempts = v_attempts,
        invalidated_at = case when v_attempts >= 5 then v_now else invalidated_at end
    where id = v_code.id;
    return query select false, 'wrong_code', greatest(0, 5 - v_attempts);
    return;
  end if;

  update public.email_verification_codes
  set consumed_at = v_now,
      invalidated_at = v_now
  where id = v_code.id;

  return query select true, 'verified', 0;
end;
$$;

revoke all on function public.issue_email_verification(text, text, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.verify_email_verification(text, text) from public, anon, authenticated;
grant execute on function public.issue_email_verification(text, text, timestamptz, integer) to service_role;
grant execute on function public.verify_email_verification(text, text) to service_role;
