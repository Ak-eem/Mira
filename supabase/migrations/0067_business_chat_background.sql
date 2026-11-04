-- Owner-chosen background colour for the customer-facing chat, next to brand_color (0064).
-- NULL = Mira's default cream background. Lowercase #rrggbb only, enforced by a check
-- constraint so nothing else can ever reach a CSS value.
--
-- update_business_chat_colors sets both colours in one call (owner or platform admin
-- only, touches nothing else). update_business_brand_color from 0064 is left in place
-- but is no longer called by the app.
--
-- Safe to re-run.

alter table businesses
  add column if not exists background_color text;

alter table businesses drop constraint if exists businesses_background_color_check;
alter table businesses add constraint businesses_background_color_check
  check (background_color is null or background_color ~ '^#[0-9a-f]{6}$');

create or replace function update_business_chat_colors(
  p_business_id uuid,
  p_brand text,
  p_background text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (is_platform_admin() or is_business_admin(p_business_id)) then
    raise exception 'not authorized to change the chat colours for this business' using errcode = '42501';
  end if;

  if (p_brand is not null and p_brand !~ '^#[0-9a-f]{6}$')
     or (p_background is not null and p_background !~ '^#[0-9a-f]{6}$') then
    raise exception 'colours must be #rrggbb hex values' using errcode = '22023';
  end if;

  update businesses
     set brand_color = p_brand,
         background_color = p_background
   where id = p_business_id;

  if not found then
    raise exception 'business not found';
  end if;
end;
$$;

revoke all on function update_business_chat_colors(uuid, text, text) from public, anon;
grant execute on function update_business_chat_colors(uuid, text, text) to authenticated, service_role;
