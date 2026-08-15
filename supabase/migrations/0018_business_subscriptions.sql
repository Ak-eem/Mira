-- Doesn't exist anywhere yet -- Mira has never had a plan/subscription
-- concept in the schema, even though pricing already works this way in
-- practice. Placeholder tier names in the check constraints below (base
-- Mira plan names, and the Nudges ₦5k/₦10k tiers) -- swap in the real
-- ones whenever they're settled. No payment gateway is wired up: status
-- is set by hand (admin UI) for now, not by any webhook.
create table business_subscriptions (
  business_id uuid primary key references businesses(id) on delete cascade,
  plan text not null default 'base' check (plan in ('base', 'pro')),
  nudges_addon boolean not null default false,
  nudges_tier text check (nudges_tier in ('basic', 'plus')), -- ₦5,000 / ₦10,000
  max_nudges_per_customer_per_week integer not null default 2 check (max_nudges_per_customer_per_week > 0),
  status text not null default 'active' check (status in ('active', 'past_due', 'cancelled')),
  billing_cycle_start date not null default current_date,
  updated_at timestamptz not null default now()
);

alter table business_subscriptions enable row level security;

create policy "admins manage business_subscriptions" on business_subscriptions
  for all using (is_platform_admin()) with check (is_platform_admin());
create policy "owners read own subscription" on business_subscriptions
  for select using (is_business_owner(business_id));
