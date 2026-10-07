-- Owner-initiated cancellation, and the ability to delete a cancelled business.
-- Safe to re-run.

-- 1. When the subscription was cancelled. Used to find businesses due for
--    deletion 30 days after cancelling (see docs/data-retention.md).
alter table business_subscriptions
  add column if not exists cancelled_at timestamptz;

-- 2. Deleting data must never be blocked by the paywall.
--
-- enforce_active_business_subscription() raises SUBSCRIPTION_REQUIRED for any
-- write to a tenant's tables unless the subscription is active or in a live
-- trial. That includes DELETE, so deleting a business (which cascades into those
-- tables) failed for every cancelled or lapsed business -- the very ones the
-- Terms promise to delete 30 days after cancelling. Tested: with the
-- subscription cancelled the delete failed with SUBSCRIPTION_REQUIRED; with it
-- active it succeeded.
--
-- Only DELETE is exempted. Creating or changing content still requires an
-- active subscription, so this does not let an unpaid business keep working.
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
begin
  if tg_op = 'DELETE' then
    return old;
  end if;

  target_business_id := case
    when tg_table_name = 'businesses' then coalesce(new.id, old.id)
    else coalesce(new.business_id, old.business_id)
  end;

  select status, trial_ends_at into subscription_status, trial_end
  from business_subscriptions
  where business_id = target_business_id;

  if found and (subscription_status = 'active'
     or (subscription_status = 'trialing' and trial_end > now())) then
    return coalesce(new, old);
  end if;

  -- Only allow business-row creation without a subscription so the atomic
  -- provisioning action can create the initial business before its trial row.
  if tg_table_name = 'businesses' and tg_op = 'INSERT' then
    return new;
  end if;

  raise exception using errcode = 'P0001', message = 'SUBSCRIPTION_REQUIRED';
end;
$$;

-- 3. Cancel. Takes effect immediately: every public entry point (web chat,
--    embed widget, WhatsApp, email) treats a 'cancelled' subscription as
--    "business not found". Idempotent: cancelling twice is a no-op.
--
-- SECURITY DEFINER because owners can only SELECT their subscription row under
-- RLS; the permission check lives here instead. Only an owner of THIS business
-- (role = 'owner', not staff) or a platform admin can cancel.
create or replace function cancel_business_subscription(p_business_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (is_platform_admin() or is_business_admin(p_business_id)) then
    raise exception 'not authorized to cancel this subscription' using errcode = '42501';
  end if;

  update business_subscriptions
     set status = 'cancelled',
         cancelled_at = now(),
         updated_at = now()
   where business_id = p_business_id
     and status <> 'cancelled';

  if not found and not exists (select 1 from business_subscriptions where business_id = p_business_id) then
    raise exception 'no subscription found for this business';
  end if;
end;
$$;

revoke all on function cancel_business_subscription(uuid) from public, anon;
grant execute on function cancel_business_subscription(uuid) to authenticated, service_role;
