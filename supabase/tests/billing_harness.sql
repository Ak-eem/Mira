drop schema if exists public cascade; create schema public;
drop schema if exists auth cascade; create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
create table businesses (id uuid primary key default gen_random_uuid(), name text);
create table business_owners (id uuid primary key default gen_random_uuid(), business_id uuid references businesses(id) on delete cascade, user_id uuid references auth.users(id), role text default 'owner', unique(business_id,user_id));
create function is_platform_admin() returns boolean language sql stable as $$ select coalesce(current_setting('test.admin', true),'') = 'on' $$;
create table business_subscriptions (
  business_id uuid primary key references businesses(id) on delete cascade,
  plan text not null default 'base', status text not null default 'active' check (status in ('active','past_due','cancelled','trialing')),
  trial_started_at timestamptz, trial_ends_at timestamptz, updated_at timestamptz not null default now(),
  reference text unique, amount integer, paid_at timestamptz, expires_at timestamptz);
create table products (id uuid primary key default gen_random_uuid(), business_id uuid references businesses(id), name text);
