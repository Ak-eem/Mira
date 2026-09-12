-- Lets a freshly signed-up user create their own business record and
-- immediately provision its trial, in one call -- businesses is normally
-- admin-only for insert (see migration 0001's "admins manage businesses"
-- policy), so self-service signup has no other way to create one.
-- Reuses provision_business_trial() rather than duplicating its logic.
create or replace function provision_new_business(p_name text, p_owner_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
  v_base_slug text;
  v_slug text;
  v_suffix int := 0;
begin
  if auth.uid() is distinct from p_owner_id and not is_platform_admin() then
    raise exception 'Not authorized to provision a business for this owner';
  end if;

  if p_name is null or trim(p_name) = '' then
    raise exception using errcode = 'P0001', message = 'BUSINESS_NAME_REQUIRED';
  end if;

  v_base_slug := lower(regexp_replace(trim(p_name), '[^a-zA-Z0-9]+', '-', 'g'));
  v_base_slug := trim(both '-' from v_base_slug);
  if v_base_slug = '' then
    v_base_slug := 'business';
  end if;

  v_slug := v_base_slug;
  loop
    exit when not exists (select 1 from businesses where slug = v_slug);
    v_suffix := v_suffix + 1;
    v_slug := v_base_slug || '-' || v_suffix;
  end loop;

  insert into businesses (name, slug)
  values (trim(p_name), v_slug)
  returning id into v_business_id;

  -- Surfaces TRIAL_ALREADY_USED (see migration 0027) if this owner has
  -- already had a trial before -- the business row above still gets
  -- created, but this raises, so the caller knows to route them to
  -- billing instead of pretending they got a fresh trial.
  perform provision_business_trial(v_business_id, p_owner_id);

  return v_business_id;
end;
$$;

revoke all on function provision_new_business(text, uuid) from public;
grant execute on function provision_new_business(text, uuid) to authenticated;
