-- Core schema for Mira v0.1: platform admin, businesses, services.
-- business_hours, promotions, closures, faqs, and policies land in a
-- later migration once the core loop (login -> create business -> add a
-- service -> chat answers correctly) is proven end to end.

create table platform_admins (
  id uuid primary key references auth.users(id),
  email text not null,
  created_at timestamptz not null default now()
);

create table businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  currency text not null default 'NGN',
  timezone text not null default 'Africa/Lagos',
  ai_tone text,
  ai_instructions text,
  hours_note text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_businesses_slug on businesses(slug);

create table services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  description text,
  price numeric(12,2),
  is_available boolean not null default true,
  availability_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_services_business on services(business_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- security definer: bypasses RLS internally to check platform_admins
-- membership. Without this, the policy on platform_admins would need to
-- query platform_admins to evaluate itself, which Postgres RLS does not
-- handle by simple recursion.
create function is_platform_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from platform_admins where id = auth.uid()
  );
$$;

alter table platform_admins enable row level security;
alter table businesses enable row level security;
alter table services enable row level security;

create policy "admins manage platform_admins"
  on platform_admins for all
  using (is_platform_admin())
  with check (is_platform_admin());

create policy "admins manage businesses"
  on businesses for all
  using (is_platform_admin())
  with check (is_platform_admin());

create policy "admins manage services"
  on services for all
  using (is_platform_admin())
  with check (is_platform_admin());

-- Reuse is_platform_admin() for every table added in later migrations —
-- same policy shape, same guarantee, one place to change it if it ever
-- needs to.

-- ============================================================
-- BOOTSTRAP: creating the first admin
-- ============================================================
-- The policies above mean a normal insert into platform_admins requires
-- already being a platform_admin — a chicken-and-egg problem for the
-- very first one. To bootstrap:
--
--   1. Create your user in Supabase Auth
--      (dashboard -> Authentication -> Add user)
--   2. Run this in the SQL editor, which executes as the table owner
--      and bypasses RLS:
--
--        insert into platform_admins (id, email)
--        values ('<your-auth-user-uuid>', '<your-email>');
