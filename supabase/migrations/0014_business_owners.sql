-- A person who can log into the business portal for one or more
-- businesses. A join table, not a single owner_id on businesses: lets a
-- business add a second staff login later, and lets one person run more
-- than one business on Mira, without a schema change either way.
create table business_owners (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'staff')),
  created_at timestamptz not null default now(),
  unique (business_id, user_id)
);
create index idx_business_owners_user on business_owners(user_id);
create index idx_business_owners_business on business_owners(business_id);

alter table business_owners enable row level security;

create policy "owners view own membership" on business_owners
  for select using (user_id = auth.uid());
create policy "admins manage business_owners" on business_owners
  for all using (is_platform_admin()) with check (is_platform_admin());

-- Mirrors is_platform_admin()'s shape (security definer + fixed
-- search_path, same reason: this needs to read business_owners without
-- recursing back through business_owners' own RLS).
create function is_business_owner(target_business_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from business_owners
    where business_id = target_business_id
      and user_id = auth.uid()
  );
$$;

-- Purely additive: a NEW policy per table, alongside the existing
-- "admins manage X" one. Postgres ORs multiple permissive policies for
-- the same command together, so this never touches or risks breaking
-- the existing admin policies -- an owner row just satisfies this one
-- too. Read-only for now: the portal doesn't offer catalogue/hours
-- editing yet, only Nudges rules and orders (see their own migrations)
-- and resolving their own handoffs.
create policy "owners read own business" on businesses
  for select using (is_business_owner(id));
create policy "owners read own conversations" on conversations
  for select using (is_business_owner(business_id));
create policy "owners resolve own handoffs" on conversations
  for update using (is_business_owner(business_id)) with check (is_business_owner(business_id));
create policy "owners read own messages" on messages
  for select using (is_business_owner(business_id));
create policy "owners read own products" on products
  for select using (is_business_owner(business_id));
create policy "owners read own services" on services
  for select using (is_business_owner(business_id));
create policy "owners read own faqs" on faqs
  for select using (is_business_owner(business_id));
create policy "owners read own policies" on policies
  for select using (is_business_owner(business_id));
create policy "owners read own promotions" on promotions
  for select using (is_business_owner(business_id));
create policy "owners read own business_hours" on business_hours
  for select using (is_business_owner(business_id));
create policy "owners read own closures" on closures
  for select using (is_business_owner(business_id));
