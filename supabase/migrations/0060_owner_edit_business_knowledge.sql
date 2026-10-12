-- Business owners can edit what Mira knows about their own business.
--
-- Until now products, services, FAQs, policies and opening hours were read-only
-- for owners (0014: "owners read own ..."); all editing was platform-admin work.
-- That also meant the owner Inventory assistant, which writes products with the
-- owner's own login, was silently refused by Row Level Security (same class of bug
-- 0054 fixed for business settings).
--
-- These policies are row-scoped to the owner's own business, so unlike the
-- `businesses` table (which has sensitive columns, hence 0054's narrow functions)
-- plain policies are enough. Only the 'owner' role may write; 'staff' keep
-- read-only access. Product photos live under <business_id>/ in the
-- product-images bucket, so the storage policy is scoped to that folder.
--
-- Safe to re-run.

create or replace function is_business_owner_role(target_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from business_owners
    where business_id = target_business_id
      and user_id = auth.uid()
      and role = 'owner'
  );
$$;

do $$
declare
  t text;
begin
  foreach t in array array['products', 'services', 'faqs', 'policies', 'business_hours'] loop
    execute format('drop policy if exists %I on %I', 'owners insert own ' || t, t);
    execute format('drop policy if exists %I on %I', 'owners update own ' || t, t);
    execute format('drop policy if exists %I on %I', 'owners delete own ' || t, t);
    execute format('create policy %I on %I for insert with check (is_business_owner_role(business_id))', 'owners insert own ' || t, t);
    execute format('create policy %I on %I for update using (is_business_owner_role(business_id)) with check (is_business_owner_role(business_id))', 'owners update own ' || t, t);
    execute format('create policy %I on %I for delete using (is_business_owner_role(business_id))', 'owners delete own ' || t, t);
  end loop;
end
$$;

drop policy if exists "owners manage own product images" on storage.objects;
create policy "owners manage own product images"
  on storage.objects for all
  using (
    bucket_id = 'product-images'
    and exists (
      select 1 from business_owners bo
      where bo.user_id = auth.uid()
        and bo.role = 'owner'
        and bo.business_id::text = (storage.foldername(name))[1]
    )
  )
  with check (
    bucket_id = 'product-images'
    and exists (
      select 1 from business_owners bo
      where bo.user_id = auth.uid()
        and bo.role = 'owner'
        and bo.business_id::text = (storage.foldername(name))[1]
    )
  );
