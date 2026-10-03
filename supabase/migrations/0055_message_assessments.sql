-- Grounding assessments: for each reply Mira sends through the normal AI path,
-- a deterministic check of whether the facts in it (prices, hours, links,
-- contact details, a few policy claims) appear in the business's own
-- information. See lib/grounding/assess.ts. Flag-only: the check runs after the
-- reply is sent and never changes what the customer sees.
--
-- Requires 0054 (adds businesses.grounding_review_level and
-- businesses.grounding_escalate_repeat). Safe to re-run.

create table if not exists message_assessments (
  message_id uuid primary key references messages(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  verdict text not null check (verdict in ('high', 'medium', 'low', 'unchecked')),
  -- [{ "type": "price", "value": "₦18,000", "supported": false }, ...]  (capped in code)
  signals jsonb not null default '[]'::jsonb,
  -- The customer message this replied to, so the review list needs no extra joins.
  question text,
  created_at timestamptz not null default now()
);

-- "Needs review" list: newest flagged replies for a business.
create index if not exists idx_message_assessments_review
  on message_assessments (business_id, created_at desc)
  where verdict in ('low', 'medium');

alter table message_assessments enable row level security;

-- Members of the business and platform admins can read; nobody writes through
-- the API -- assessments are inserted by the server with the service-role key.
drop policy if exists "members read assessments" on message_assessments;
create policy "members read assessments" on message_assessments
  for select to authenticated
  using (is_business_member(business_id));

drop policy if exists "admins read assessments" on message_assessments;
create policy "admins read assessments" on message_assessments
  for select to authenticated
  using (is_platform_admin());

revoke all on table message_assessments from anon;
revoke insert, update, delete on table message_assessments from authenticated;

-- ===== verification =====  (every ok should be true)
select 'message_assessments table' as check_name,
       exists (select 1 from information_schema.tables where table_name = 'message_assessments') as ok
union all select 'RLS on message_assessments',
       (select relrowsecurity from pg_class where oid = 'public.message_assessments'::regclass)
union all select 'anon cannot read message_assessments',
       not has_table_privilege('anon', 'public.message_assessments', 'select')
union all select 'authenticated cannot write message_assessments',
       not has_table_privilege('authenticated', 'public.message_assessments', 'insert')
union all select '0054 columns present (grounding settings)',
       (select count(*) = 2 from information_schema.columns
         where table_name = 'businesses' and column_name in ('grounding_review_level', 'grounding_escalate_repeat'));
