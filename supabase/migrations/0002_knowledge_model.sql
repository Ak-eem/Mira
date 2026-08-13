-- Adds the remaining knowledge-model tables (business_hours, promotions,
-- closures, faqs, policies) and the conversation/message tables the chat
-- flow needs. Reuses is_platform_admin() from 0001 for every RLS policy.

create table business_hours (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6), -- 0=Sun
  opens_at time,
  closes_at time,
  unique (business_id, day_of_week)
);
create index idx_business_hours_business on business_hours(business_id);

create table promotions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  service_id uuid references services(id) on delete cascade,
  description text not null,
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index idx_promotions_business on promotions(business_id);

create table closures (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  created_at timestamptz not null default now()
);
create index idx_closures_business on closures(business_id);

create table faqs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  question text not null,
  answer text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_faqs_business on faqs(business_id);

create table policies (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  title text not null,
  content text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_policies_business on policies(business_id);

-- ============================================================
-- CONVERSATIONS + MESSAGES
-- ============================================================
-- These belong to the customer-chat path, not the admin path -- customers
-- never get a Supabase session, so no RLS policy ever applies to them.
-- Isolation on this path is enforced entirely by application code (see
-- app/api/chat/route.ts): every query filters by business_id by hand.
-- RLS is still enabled and locked to admins below, as a backstop against
-- any future client-side query that forgets to scope itself.

create table conversations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  session_token text not null,
  status text not null default 'open',
  started_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);
create index idx_conversations_business on conversations(business_id);
create index idx_conversations_session on conversations(business_id, session_token);

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  role text not null check (role in ('customer','assistant')),
  content text not null,
  context_snapshot jsonb,
  created_at timestamptz not null default now()
);
create index idx_messages_conversation on messages(conversation_id, created_at);
create index idx_messages_business on messages(business_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table business_hours enable row level security;
alter table promotions enable row level security;
alter table closures enable row level security;
alter table faqs enable row level security;
alter table policies enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;

create policy "admins manage business_hours" on business_hours for all
  using (is_platform_admin()) with check (is_platform_admin());
create policy "admins manage promotions" on promotions for all
  using (is_platform_admin()) with check (is_platform_admin());
create policy "admins manage closures" on closures for all
  using (is_platform_admin()) with check (is_platform_admin());
create policy "admins manage faqs" on faqs for all
  using (is_platform_admin()) with check (is_platform_admin());
create policy "admins manage policies" on policies for all
  using (is_platform_admin()) with check (is_platform_admin());
create policy "admins manage conversations" on conversations for all
  using (is_platform_admin()) with check (is_platform_admin());
create policy "admins manage messages" on messages for all
  using (is_platform_admin()) with check (is_platform_admin());
