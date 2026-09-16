-- Product images are mirrored by the application before approval. PostgreSQL
-- only receives the resulting Mira-hosted URL and never makes outbound calls.
drop function if exists approve_scrape_draft(uuid);

create or replace function approve_scrape_draft(p_draft_id uuid, p_image_url text default null)
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
      insert into products (business_id, name, description, price, image_url)
      values (v_draft.business_id, v_payload->>'name', v_payload->>'description', (v_payload->>'price')::numeric, p_image_url);
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

revoke all on function approve_scrape_draft(uuid, text) from public;
grant execute on function approve_scrape_draft(uuid, text) to authenticated;
