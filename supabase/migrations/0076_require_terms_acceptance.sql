-- ENFORCEMENT for 0075: provision_new_business (the only sanctioned way a self-service signup creates its business)
-- now refuses to run unless the person has a recorded acceptance of the CURRENT terms. Editing the signup page can no
-- longer skip the agreement.
--
-- !! Apply this ONLY AFTER the site that calls record_terms_acceptance() is live. On the old site, which does not
-- !! record an acceptance, every new signup would fail with TERMS_NOT_ACCEPTED until the new site is deployed.
--
-- Platform admins provisioning a business for someone else are not the owner agreeing, so that path is unchanged.
-- Same body as 0029, plus the check and linking the acceptance to the business it created.
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

  -- The owner signing themselves up must have agreed to the current terms first.
  if auth.uid() = p_owner_id and not exists (
    select 1 from terms_acceptances
    where user_id = p_owner_id and terms_version = current_terms_version()
  ) then
    raise exception using errcode = 'P0001', message = 'TERMS_NOT_ACCEPTED';
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

  -- Tie the acceptance to the business it was given for ("I own THIS business").
  update terms_acceptances
  set business_id = v_business_id
  where user_id = p_owner_id
    and terms_version = current_terms_version()
    and business_id is null;

  -- Surfaces TRIAL_ALREADY_USED (see migration 0027) if this owner has already had a trial before.
  perform provision_business_trial(v_business_id, p_owner_id);

  return v_business_id;
end;
$$;

revoke all on function provision_new_business(text, uuid) from public;
grant execute on function provision_new_business(text, uuid) to authenticated;
