-- Owner-chosen brand colour for the customer-facing chat (chat page and website widget).
--
-- One nullable column: NULL means "use Mira's default colour". Stored as a lowercase
-- #rrggbb string and constrained so nothing else can ever end up in a CSS value.
--
-- Owners have no UPDATE policy on businesses (see 0054), so they save through a narrow
-- SECURITY DEFINER function that checks the caller is this business's owner (or a
-- platform admin) and can touch nothing but this one column.
--
-- Safe to re-run.

alter table businesses
  add column if not exists brand_color text;

alter table businesses drop constraint if exists businesses_brand_color_check;
alter table businesses add constraint businesses_brand_color_check
  check (brand_color is null or brand_color ~ '^#[0-9a-f]{6}$');

create or replace function update_business_brand_color(p_business_id uuid, p_color text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (is_platform_admin() or is_business_admin(p_business_id)) then
    raise exception 'not authorized to change the brand colour for this business' using errcode = '42501';
  end if;

  if p_color is not null and p_color !~ '^#[0-9a-f]{6}$' then
    raise exception 'brand colour must be a #rrggbb hex value' using errcode = '22023';
  end if;

  update businesses set brand_color = p_color where id = p_business_id;

  if not found then
    raise exception 'business not found';
  end if;
end;
$$;

revoke all on function update_business_brand_color(uuid, text) from public, anon;
grant execute on function update_business_brand_color(uuid, text) to authenticated, service_role;
