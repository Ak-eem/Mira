-- Paid access now actually expires, renewals stack on remaining time, each
-- Paystack reference can only ever be applied once, and platform admins are
-- no longer locked out by the enforcement trigger.
--
-- 1. enforce_active_business_subscription(): 'active' only counts while
--    expires_at is null (manual grant) or in the future. Previously a single
--    Paystack payment kept a business active forever.
-- 2. paystack_payments: ledger of applied references. business_subscriptions
--    holds ONE row per business (only the latest reference), so without a
--    ledger an owner could replay an OLD successful reference (e.g. by
--    revisiting /subscribe?reference=<old>) and be granted another period each
--    time. A reference present in the ledger is a permanent no-op.
-- 3. activate_paystack_subscription(): takes p_duration_days instead of a
--    precomputed p_expires_at, and extends from greatest(now(), current
--    expiry) so paying early never discards remaining days.
-- 4. revoke_paystack_subscription(): cancels the subscription a fully
--    refunded payment bought.

create or replace function enforce_active_business_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_business_id uuid;
  subscription_status text;
  trial_end timestamptz;
  paid_until timestamptz;
begin
  -- Platform admins must always be able to manage any business.
  if is_platform_admin() then
    return coalesce(new, old);
  end if;

  target_business_id := case
    when tg_table_name = 'businesses' then coalesce(new.id, old.id)
    else coalesce(new.business_id, old.business_id)
  end;

  select status, trial_ends_at, expires_at
    into subscription_status, trial_end, paid_until
  from business_subscriptions
  where business_id = target_business_id;

  if found and (
       (subscription_status = 'active' and (paid_until is null or paid_until > now()))
    or (subscription_status = 'trialing' and trial_end > now())
  ) then
    return coalesce(new, old);
  end if;

  if tg_table_name = 'businesses' and tg_op = 'INSERT' then
    return new;
  end if;

  raise exception using errcode = 'P0001', message = 'SUBSCRIPTION_REQUIRED';
end;
$$;

-- Ledger of Paystack references that have been applied. Server-only.
create table if not exists public.paystack_payments (
  reference text primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid,
  amount integer not null,
  created_at timestamptz not null default now()
);
alter table public.paystack_payments enable row level security;
revoke all on table public.paystack_payments from anon, authenticated;

-- Existing paid subscribers: their latest reference counts as applied.
insert into public.paystack_payments (reference, business_id, amount)
select reference, business_id, coalesce(amount, 0)
from public.business_subscriptions
where reference is not null
on conflict (reference) do nothing;

drop function if exists public.activate_paystack_subscription(uuid, uuid, text, integer, timestamptz, integer, text);

create or replace function public.activate_paystack_subscription(
  p_business_id uuid,
  p_user_id uuid,
  p_reference text,
  p_amount integer,
  p_duration_days integer,
  p_expected_amount_kobo integer,
  p_plan text default 'base'
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  normalized_reference text := btrim(p_reference);
  inserted_rows integer;
begin
  if p_business_id is null
     or p_user_id is null
     or p_reference is null
     or normalized_reference = ''
     or p_amount is null
     or p_expected_amount_kobo is null
     or p_amount <> p_expected_amount_kobo
     or p_duration_days is null
     or p_duration_days <= 0
     or p_plan is distinct from 'base' then
    raise exception 'invalid Paystack activation input';
  end if;

  -- A Paystack reference must never activate another business.
  if exists (
    select 1 from public.paystack_payments
    where reference = normalized_reference
      and business_id is distinct from p_business_id
  ) or exists (
    select 1 from public.business_subscriptions
    where reference = normalized_reference
      and business_id is distinct from p_business_id
  ) then
    raise exception 'Paystack reference has already been used';
  end if;

  -- Already applied (retry, replay, or revisited /subscribe link) -> no-op.
  -- This includes references whose payment was later refunded: a late
  -- redelivery of the original charge.success must not switch access back on.
  if exists (select 1 from public.paystack_payments where reference = normalized_reference) then
    return;
  end if;

  if not exists (
    select 1 from public.business_owners
    where business_id = p_business_id and user_id = p_user_id
  ) then
    raise exception 'user is no longer associated with this business';
  end if;

  -- Claim the reference atomically; if a concurrent call won the race it is a no-op.
  insert into public.paystack_payments (reference, business_id, user_id, amount)
  values (normalized_reference, p_business_id, p_user_id, p_amount)
  on conflict (reference) do nothing;
  get diagnostics inserted_rows = row_count;
  if inserted_rows = 0 then
    return;
  end if;

  insert into public.business_subscriptions (
    business_id, plan, status, reference, amount, paid_at, expires_at, updated_at
  )
  values (
    p_business_id, p_plan, 'active', normalized_reference, p_amount, now(),
    now() + make_interval(days => p_duration_days), now()
  )
  on conflict (business_id) do update
  set plan = excluded.plan,
      status = 'active',
      reference = excluded.reference,
      amount = excluded.amount,
      paid_at = excluded.paid_at,
      -- Stack on top of any unexpired paid time instead of resetting it.
      expires_at = greatest(
        now(),
        case
          when business_subscriptions.status = 'active'
            then coalesce(business_subscriptions.expires_at, now())
          else now()
        end
      ) + make_interval(days => p_duration_days),
      updated_at = now();
end;
$$;

revoke all on function public.activate_paystack_subscription(uuid, uuid, text, integer, integer, integer, text) from public, anon, authenticated;
grant execute on function public.activate_paystack_subscription(uuid, uuid, text, integer, integer, integer, text) to service_role;

-- Refunds: cancel the subscription a fully refunded payment bought. Only the
-- latest payment is tracked on the subscription row, so refunding an older
-- payment (or a partial refund below what was paid) leaves access alone and
-- is left for manual handling. A null amount is treated as a full refund.
create or replace function public.revoke_paystack_subscription(p_reference text, p_refund_amount integer default null)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.business_subscriptions
  set status = 'cancelled', updated_at = now()
  where reference = btrim(p_reference)
    and status = 'active'
    and (p_refund_amount is null or amount is null or p_refund_amount >= amount);
$$;

revoke all on function public.revoke_paystack_subscription(text, integer) from public, anon, authenticated;
grant execute on function public.revoke_paystack_subscription(text, integer) to service_role;
