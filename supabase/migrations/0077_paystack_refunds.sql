-- Refunds and chargebacks, done properly.
--
-- Before this: a business has ONE subscription row that remembers only its latest payment
-- reference. A full refund of that payment cancelled the whole subscription (including days an
-- earlier payment had bought), and a refund of an EARLIER payment matched nothing, so the
-- business kept the refunded days. Refunds and chargebacks were not recorded anywhere.
--
-- Now each payment records how many days it bought (period_days) and the coverage that existed
-- before it (prev_expires_at). From those, a refund removes exactly the days that payment
-- contributed, with early-renewal stacking taken into account (lib/billing/periodEnd.ts), and
-- cancels the subscription only when nothing paid is left. Every refund and chargeback is
-- recorded on the payment row, and the functions return an outcome so the webhook can alert.
--
-- Payments made before this migration have period_days = NULL. They keep the old behaviour
-- (cancel only if it is the current subscription's payment), and anything that does not match
-- is reported as "needs_review" instead of silently doing nothing.

begin;

alter table public.paystack_payments
  add column if not exists period_days integer,
  add column if not exists prev_expires_at timestamptz,
  add column if not exists refunded_amount integer,
  add column if not exists refunded_at timestamptz,
  add column if not exists access_revoked_at timestamptz,
  add column if not exists disputed_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'paystack_payments_period_days_check') then
    alter table public.paystack_payments
      add constraint paystack_payments_period_days_check check (period_days is null or period_days > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'paystack_payments_refunded_amount_check') then
    alter table public.paystack_payments
      add constraint paystack_payments_refunded_amount_check check (refunded_amount is null or refunded_amount >= 0);
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Activation: same rules as 0067, plus it records how long the payment bought and what coverage
-- the business already had. p_period_days is optional so a server still running older code keeps
-- working (it just records an "untracked" payment).
-- ---------------------------------------------------------------------------------------------
drop function if exists public.activate_paystack_subscription(uuid, uuid, text, integer, timestamptz, integer, text);

create or replace function public.activate_paystack_subscription(
  p_business_id uuid,
  p_user_id uuid,
  p_reference text,
  p_amount integer,
  p_expires_at timestamptz,
  p_expected_amount_kobo integer,
  p_plan text default 'base',
  p_period_days integer default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  normalized_reference text := btrim(p_reference);
  inserted_rows integer;
  prev_status text;
  prev_expiry timestamptz;
  prev_end timestamptz;
begin
  if p_business_id is null
     or p_user_id is null
     or p_reference is null
     or normalized_reference = ''
     or p_amount is null
     or p_expected_amount_kobo is null
     or p_amount <> p_expected_amount_kobo
     or p_expires_at is null
     or p_expires_at <= now()
     or p_plan is distinct from 'base'
     or (p_period_days is not null and p_period_days <= 0) then
    raise exception 'invalid Paystack activation input';
  end if;

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

  if exists (select 1 from public.paystack_payments where reference = normalized_reference) then
    return;
  end if;

  if not exists (
    select 1 from public.business_owners
    where business_id = p_business_id and user_id = p_user_id
  ) then
    raise exception 'user is no longer associated with this business';
  end if;

  -- Coverage the business already had, which this payment stacks onto (same rule as nextPeriodEnd).
  select status, expires_at into prev_status, prev_expiry
  from public.business_subscriptions
  where business_id = p_business_id
  for update;
  prev_end := case when prev_status = 'active' and prev_expiry > now() then prev_expiry else null end;

  insert into public.paystack_payments (reference, business_id, user_id, amount, period_days, prev_expires_at)
  values (normalized_reference, p_business_id, p_user_id, p_amount, p_period_days, prev_end)
  on conflict (reference) do nothing;
  get diagnostics inserted_rows = row_count;
  if inserted_rows = 0 then
    return;
  end if;

  insert into public.business_subscriptions (
    business_id, plan, status, reference, amount, paid_at, expires_at, updated_at
  )
  values (
    p_business_id, p_plan, 'active', normalized_reference, p_amount, now(), p_expires_at, now()
  )
  on conflict (business_id) do update
  set plan = excluded.plan,
      status = 'active',
      reference = excluded.reference,
      amount = excluded.amount,
      paid_at = excluded.paid_at,
      expires_at = excluded.expires_at,
      updated_at = now();
end;
$$;

revoke all on function public.activate_paystack_subscription(uuid, uuid, text, integer, timestamptz, integer, text, integer) from public, anon, authenticated;
grant execute on function public.activate_paystack_subscription(uuid, uuid, text, integer, timestamptz, integer, text, integer) to service_role;

-- ---------------------------------------------------------------------------------------------
-- Rebuilds, from the payment ledger, when a business's paid coverage ends, optionally leaving one
-- payment out. Replays the same stacking rule used at payment time:
--   a payment extends from the end of existing coverage, or from when it was made if none was left.
-- Returns NULL when the ledger cannot be trusted to rebuild it (no tracked payments, or an
-- untracked payment recorded after a tracked one); callers then fall back to the old behaviour.
-- ---------------------------------------------------------------------------------------------
create or replace function public.paystack_coverage_end(p_business_id uuid, p_skip_reference text default null)
returns timestamptz
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  p record;
  seen_tracked boolean := false;
  e timestamptz := null;
begin
  for p in
    select reference, created_at, period_days, prev_expires_at, access_revoked_at
    from public.paystack_payments
    where business_id = p_business_id
    order by created_at, reference
  loop
    if p.period_days is null then
      -- Before tracking began its coverage is folded into the first tracked payment's
      -- prev_expires_at. After a tracked payment it cannot be placed, so give up.
      if seen_tracked then return null; end if;
      continue;
    end if;

    if not seen_tracked then
      seen_tracked := true;
      e := p.prev_expires_at; -- coverage that no tracked payment is responsible for
    end if;

    if p.access_revoked_at is not null or p.reference is not distinct from p_skip_reference then
      continue;
    end if;

    if e is null or e <= p.created_at then
      e := p.created_at + make_interval(days => p.period_days);
    else
      e := e + make_interval(days => p.period_days);
    end if;
  end loop;

  if not seen_tracked then return null; end if;
  return e;
end;
$$;

revoke all on function public.paystack_coverage_end(uuid, text) from public, anon, authenticated;
grant execute on function public.paystack_coverage_end(uuid, text) to service_role;

-- ---------------------------------------------------------------------------------------------
-- A refund of a payment. Safe to call repeatedly (Paystack retries, events can repeat).
-- Outcomes: unknown_reference, partial_recorded, already_applied, no_active_subscription,
--           unchanged, shortened, revoked, needs_review.
-- ---------------------------------------------------------------------------------------------
create or replace function public.refund_paystack_payment(p_reference text, p_refund_amount integer default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  ref text := btrim(p_reference);
  pay public.paystack_payments%rowtype;
  sub public.business_subscriptions%rowtype;
  refunded integer;
  details jsonb;
  before_end timestamptz;
  after_end timestamptz;
  new_expires timestamptz;
  trusted boolean;
begin
  if ref is null or ref = '' then
    return jsonb_build_object('outcome', 'unknown_reference');
  end if;

  select * into pay from public.paystack_payments where reference = ref for update;
  if not found then
    return jsonb_build_object('outcome', 'unknown_reference', 'reference', ref);
  end if;

  -- Record the refund. Never lowers an amount already recorded, so replays and out-of-order
  -- events are harmless. A refund event without an amount is treated as a full refund.
  refunded := greatest(coalesce(pay.refunded_amount, 0), coalesce(p_refund_amount, pay.amount));
  update public.paystack_payments
  set refunded_amount = refunded, refunded_at = coalesce(refunded_at, now())
  where reference = ref;

  details := jsonb_build_object(
    'reference', ref, 'business_id', pay.business_id, 'amount', pay.amount, 'refunded_amount', refunded
  );

  if refunded < pay.amount then
    return details || jsonb_build_object('outcome', 'partial_recorded');
  end if;
  if pay.access_revoked_at is not null then
    return details || jsonb_build_object('outcome', 'already_applied');
  end if;

  select * into sub from public.business_subscriptions where business_id = pay.business_id for update;
  if not found or sub.status <> 'active' then
    update public.paystack_payments set access_revoked_at = now() where reference = ref;
    return details || jsonb_build_object('outcome', 'no_active_subscription');
  end if;

  details := details || jsonb_build_object('expires_before', sub.expires_at);

  trusted := pay.period_days is not null and sub.expires_at is not null;
  if trusted then
    before_end := public.paystack_coverage_end(pay.business_id, null);
    after_end := public.paystack_coverage_end(pay.business_id, ref);
    trusted := before_end is not null;
  end if;

  update public.paystack_payments set access_revoked_at = now() where reference = ref;

  if not trusted then
    -- Old behaviour: cancel only when this is the current subscription's payment.
    if sub.reference = ref then
      update public.business_subscriptions set status = 'cancelled', updated_at = now()
      where business_id = pay.business_id;
      return details || jsonb_build_object('outcome', 'revoked', 'status_after', 'cancelled');
    end if;
    return details || jsonb_build_object(
      'outcome', 'needs_review',
      'reason', 'this payment predates day tracking and is not the current one, so its days could not be removed automatically'
    );
  end if;

  if after_end is null then
    update public.business_subscriptions set status = 'cancelled', updated_at = now()
    where business_id = pay.business_id;
    return details || jsonb_build_object('outcome', 'revoked', 'status_after', 'cancelled');
  end if;

  -- Remove only the days this payment contributed; keeps any manual adjustment made by an admin.
  new_expires := sub.expires_at - greatest(before_end - after_end, interval '0');

  if new_expires <= now() then
    update public.business_subscriptions set status = 'cancelled', updated_at = now()
    where business_id = pay.business_id;
    return details || jsonb_build_object('outcome', 'revoked', 'status_after', 'cancelled');
  end if;

  if new_expires = sub.expires_at then
    return details || jsonb_build_object('outcome', 'unchanged', 'status_after', 'active');
  end if;

  update public.business_subscriptions set expires_at = new_expires, updated_at = now()
  where business_id = pay.business_id;
  return details || jsonb_build_object('outcome', 'shortened', 'status_after', 'active', 'expires_after', new_expires);
end;
$$;

revoke all on function public.refund_paystack_payment(text, integer) from public, anon, authenticated;
grant execute on function public.refund_paystack_payment(text, integer) to service_role;

-- ---------------------------------------------------------------------------------------------
-- A chargeback / dispute. Recorded only: access is deliberately not touched (see the webhook),
-- but the operator is alerted with the details so the dispute can be answered in time.
-- ---------------------------------------------------------------------------------------------
create or replace function public.record_paystack_dispute(p_reference text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  ref text := btrim(p_reference);
  pay public.paystack_payments%rowtype;
  first_time boolean;
begin
  if ref is null or ref = '' then
    return jsonb_build_object('outcome', 'unknown_reference');
  end if;
  select * into pay from public.paystack_payments where reference = ref for update;
  if not found then
    return jsonb_build_object('outcome', 'unknown_reference', 'reference', ref);
  end if;
  first_time := pay.disputed_at is null;
  if first_time then
    update public.paystack_payments set disputed_at = now() where reference = ref;
  end if;
  return jsonb_build_object(
    'outcome', 'recorded', 'first_time', first_time,
    'reference', ref, 'business_id', pay.business_id, 'amount', pay.amount
  );
end;
$$;

revoke all on function public.record_paystack_dispute(text) from public, anon, authenticated;
grant execute on function public.record_paystack_dispute(text) to service_role;

commit;
