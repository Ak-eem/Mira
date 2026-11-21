-- A "tech_store" business type: phones, laptops, gadgets. It tunes the AI (tech-savvy, careful about specs,
-- warranty and authenticity) and can look up current specs on the web. Additive: widens the allowed types and adds
-- one function so an owner can pick general or tech_store for their own business (they cannot edit the row directly,
-- and cannot pick "school", which only Mira staff switch on).

alter table businesses drop constraint if exists businesses_business_type_check;
alter table businesses add constraint businesses_business_type_check check (business_type in ('general', 'school', 'tech_store'));

create or replace function set_business_type(p_business_id uuid, p_type text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_type not in ('general', 'school', 'tech_store') then
    raise exception 'Unknown business type';
  end if;

  if is_platform_admin() then
    null;
  elsif is_business_admin(p_business_id) and p_type in ('general', 'tech_store') then
    -- An owner may not switch a school business off school (or on) themselves.
    if exists (select 1 from businesses where id = p_business_id and business_type = 'school') then
      raise exception 'Not authorized to change this business type';
    end if;
  else
    raise exception 'Not authorized to change this business type';
  end if;

  update businesses set business_type = p_type where id = p_business_id;
end;
$$;

revoke all on function set_business_type(uuid, text) from public;
grant execute on function set_business_type(uuid, text) to authenticated;
