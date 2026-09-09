-- Billing state is authoritative in business_subscriptions.
-- A trial is permanently consumed once trial_started_at is set for an owner.
alter table business_subscriptions
  add column if not exists owner_id uuid references auth.users(id) on delete set null,
  add column if not exists trial_started_at timestamptz,
  add column if not exists trial_ends_at timestamptz;

alter table business_subscriptions drop constraint if exists business_subscriptions_status_check;
alter table business_subscriptions add constraint business_subscriptions_status_check
  check (status in ('trialing', 'active', 'past_due', 'cancelled'));

-- Historical trial rows remain unique even after they expire or are cancelled.
create unique index if not exists idx_business_subscriptions_one_trial_per_owner
  on business_subscriptions (owner_id)
  where owner_id is not null and trial_started_at is not null;

create or replace function provision_business_trial(p_business_id uuid, p_owner_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is distinct from p_owner_id and not is_platform_admin() then
    raise exception 'Not authorized to provision this trial';
  end if;

  insert into business_owners (business_id, user_id, role)
  values (p_business_id, p_owner_id, 'owner')
  on conflict (business_id, user_id) do nothing;

  insert into business_subscriptions (
    business_id, owner_id, plan, status, trial_started_at, trial_ends_at,
    billing_cycle_start, updated_at
  )
  values (
    p_business_id, p_owner_id, 'base', 'trialing', now(), now() + interval '14 days',
    current_date, now()
  );
exception
  when unique_violation then
    raise exception using errcode = 'P0001', message = 'TRIAL_ALREADY_USED';
end;
$$;

revoke all on function provision_business_trial(uuid, uuid) from public;
grant execute on function provision_business_trial(uuid, uuid) to authenticated;

-- Protect every business-scoped mutable/read model from expired or missing billing.
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

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'products', 'services', 'faqs', 'policies', 'business_hours',
    'closures', 'promotions', 'conversations', 'messages'
  ] loop
    execute format('drop trigger if exists require_active_subscription on %I', table_name);
    execute format(
      'create trigger require_active_subscription before insert or update or delete on %I for each row execute function enforce_active_business_subscription()',
      table_name
    );
  end loop;
end $$;
