-- Stage 1 site importer: owner-scoped crawl/extraction snapshots.
create table site_imports (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  url text not null,
  status text not null default 'pending' check (status in ('pending', 'crawling', 'extracting', 'ready', 'failed', 'imported')),
  pages jsonb not null default '[]'::jsonb,
  extracted_data jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_site_imports_business on site_imports(business_id, created_at desc);

alter table site_imports enable row level security;

create policy "owners manage own site imports"
  on site_imports for all
  using (is_business_owner(business_id))
  with check (is_business_owner(business_id));

-- Approval writes use the authenticated portal owner session, not a service-role client.
create policy "owners insert own products"
  on products for insert
  with check (is_business_owner(business_id));

create policy "owners insert own faqs"
  on faqs for insert
  with check (is_business_owner(business_id));

create policy "owners insert own policies"
  on policies for insert
  with check (is_business_owner(business_id));

create policy "owners insert own business hours"
  on business_hours for insert
  with check (is_business_owner(business_id));

create policy "owners update own businesses"
  on businesses for update
  using (is_business_owner(id))
  with check (is_business_owner(id));
