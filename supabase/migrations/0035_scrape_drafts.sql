create table scrape_drafts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  kind text not null check (kind in ('product', 'service', 'policy', 'faq', 'business_hours', 'image')),
  source_url text not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id)
);
create index idx_scrape_drafts_business_status on scrape_drafts(business_id, status);

alter table scrape_drafts enable row level security;

create policy "owners read own scrape_drafts" on scrape_drafts
  for select using (is_business_owner(business_id));
create policy "owners insert pending scrape_drafts" on scrape_drafts
  for insert with check (is_business_owner(business_id) and status = 'pending');
create policy "owners update pending scrape_drafts" on scrape_drafts
  for update using (is_business_owner(business_id))
  with check (is_business_owner(business_id) and status <> 'approved');
create policy "owners delete own scrape_drafts" on scrape_drafts
  for delete using (is_business_owner(business_id));
create policy "admins manage scrape_drafts" on scrape_drafts
  for all using (is_platform_admin()) with check (is_platform_admin());

create or replace function approve_scrape_draft(p_draft_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_draft scrape_drafts%rowtype;
  v_payload jsonb;
begin
  select * into v_draft from scrape_drafts where id = p_draft_id for update;
  if not found then raise exception 'SCRAPE_DRAFT_NOT_FOUND'; end if;
  if not is_business_owner(v_draft.business_id) and not is_platform_admin() then
    raise exception 'Not authorized to approve this scrape draft';
  end if;
  if v_draft.status <> 'pending' then raise exception 'SCRAPE_DRAFT_NOT_PENDING'; end if;
  v_payload := v_draft.payload;

  case v_draft.kind
    when 'product' then
      insert into products (business_id, name, description, price)
      values (v_draft.business_id, v_payload->>'name', v_payload->>'description', (v_payload->>'price')::numeric);
    when 'service' then
      insert into services (business_id, name, description, price)
      values (v_draft.business_id, v_payload->>'name', v_payload->>'description', (v_payload->>'price')::numeric);
    when 'policy' then
      insert into policies (business_id, title, content)
      values (v_draft.business_id, v_payload->>'title', v_payload->>'content');
    when 'faq' then
      insert into faqs (business_id, question, answer)
      values (v_draft.business_id, v_payload->>'question', v_payload->>'answer');
    when 'business_hours' then
      insert into business_hours (business_id, day_of_week, opens_at, closes_at)
      values (v_draft.business_id, (v_payload->>'day_of_week')::smallint, (v_payload->>'opens_at')::time, (v_payload->>'closes_at')::time);
    when 'image' then
      null;
  end case;

  update scrape_drafts
  set status = 'approved', reviewed_at = now(), reviewed_by = auth.uid()
  where id = p_draft_id;
end;
$$;

create or replace function reject_scrape_draft(p_draft_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
begin
  select business_id into v_business_id from scrape_drafts where id = p_draft_id for update;
  if not found then raise exception 'SCRAPE_DRAFT_NOT_FOUND'; end if;
  if not is_business_owner(v_business_id) and not is_platform_admin() then
    raise exception 'Not authorized to reject this scrape draft';
  end if;
  update scrape_drafts
  set status = 'rejected', reviewed_at = now(), reviewed_by = auth.uid()
  where id = p_draft_id and status = 'pending';
end;
$$;

revoke all on function approve_scrape_draft(uuid) from public;
grant execute on function approve_scrape_draft(uuid) to authenticated;
revoke all on function reject_scrape_draft(uuid) from public;
grant execute on function reject_scrape_draft(uuid) to authenticated;
