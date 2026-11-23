-- Gives a business its own Mira email address (slug@<inbound domain>) when its owner or Mira staff asks for one.
-- The domain is the receiving domain set up in Resend (INBOUND_EMAIL_DOMAIN in the app); the app passes it in, so nothing
-- about it is hard-coded here. Safe to call twice: an address that already exists is returned unchanged.
create or replace function ensure_inbound_email_address(p_business_id uuid, p_domain text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_domain text := lower(btrim(coalesce(p_domain, '')));
  v_slug text;
  v_existing text;
  v_address text;
begin
  if not (is_platform_admin() or is_business_admin(p_business_id)) then
    raise exception 'Not authorized';
  end if;

  if v_domain !~ '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$' then
    raise exception using errcode = 'P0001', message = 'INBOUND_DOMAIN_INVALID';
  end if;

  select slug, email_inbound_address into v_slug, v_existing from businesses where id = p_business_id for update;
  if not found then
    raise exception 'Business not found';
  end if;
  if v_existing is not null and btrim(v_existing) <> '' then
    return v_existing;
  end if;

  v_address := lower(v_slug || '@' || v_domain);
  update businesses set email_inbound_address = v_address where id = p_business_id;
  return v_address;
end;
$$;

revoke all on function ensure_inbound_email_address(uuid, text) from public;
grant execute on function ensure_inbound_email_address(uuid, text) to authenticated;
