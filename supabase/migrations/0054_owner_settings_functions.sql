-- Fix: business owners could not actually save their own settings.
--
-- `businesses` has exactly two policies: platform admins manage everything
-- (0001) and owners may SELECT their own row (0014). There is no owner UPDATE
-- policy, so these owner-facing writes -- all made with the owner's own login --
-- were silently ignored by Postgres (zero rows updated, no error):
--
--   * the inventory-assistant (command agent) toggle in Settings
--   * the "Allow Mira to take orders" toggle in Settings
--   * publishing a prompt release: publish_prompt_release marked the release
--     'published' but its UPDATE of businesses.ai_tone / ai_instructions /
--     active_prompt_release_id touched no rows, so the live prompt never changed
--
-- Rather than hand owners a blanket UPDATE policy on businesses (which would let
-- them change slug, plan-related fields, the WhatsApp number id, is_active...),
-- owners get narrow SECURITY DEFINER functions that check authorisation inside
-- and can only touch the specific columns they are meant to control.
--
-- Safe to re-run.

-- Two settings columns used by the answer-quality review (added here so a
-- single settings function covers every owner-controlled flag).
alter table businesses
  add column if not exists grounding_review_level text not null default 'low'
    check (grounding_review_level in ('low', 'medium')),
  add column if not exists grounding_escalate_repeat boolean not null default false;

-- 1. Owner-controlled settings. NULL arguments leave a column unchanged.
create or replace function update_business_settings(
  p_business_id uuid,
  p_ai_order_taking boolean default null,
  p_command_agent_enabled boolean default null,
  p_command_agent_provider text default null,
  p_grounding_review_level text default null,
  p_grounding_escalate_repeat boolean default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Owners (role = 'owner') and platform admins only; staff cannot change these.
  if not (is_platform_admin() or is_business_admin(p_business_id)) then
    raise exception 'not authorized to change settings for this business' using errcode = '42501';
  end if;

  update businesses
     set ai_order_taking = coalesce(p_ai_order_taking, ai_order_taking),
         command_agent_enabled = coalesce(p_command_agent_enabled, command_agent_enabled),
         command_agent_provider = coalesce(p_command_agent_provider, command_agent_provider),
         grounding_review_level = coalesce(p_grounding_review_level, grounding_review_level),
         grounding_escalate_repeat = coalesce(p_grounding_escalate_repeat, grounding_escalate_repeat)
   where id = p_business_id;

  if not found then
    raise exception 'business not found';
  end if;
end;
$$;

revoke all on function update_business_settings(uuid, boolean, boolean, text, text, boolean) from public, anon;
grant execute on function update_business_settings(uuid, boolean, boolean, text, text, boolean) to authenticated, service_role;

-- 2. publish_prompt_release now runs with the rights it needs to update the
--    business row, and does its own authorisation instead of relying on RLS.
create or replace function publish_prompt_release(
  p_business_id uuid,
  p_release_id uuid,
  p_actor_email text
)
returns prompt_releases
language plpgsql
security definer
set search_path = public
as $$
declare
  v_release prompt_releases;
begin
  if not (is_platform_admin() or is_business_admin(p_business_id)) then
    raise exception 'not authorized to publish for this business' using errcode = '42501';
  end if;

  select * into v_release
  from prompt_releases
  where id = p_release_id and business_id = p_business_id
  for update;

  if not found then
    raise exception 'publish_prompt_release: release % not found for business %', p_release_id, p_business_id;
  end if;

  if v_release.status = 'draft' then
    update prompt_releases
    set status = 'published',
        published_by = p_actor_email,
        published_at = now()
    where id = v_release.id
    returning * into v_release;
  end if;

  update businesses
  set active_prompt_release_id = v_release.id,
      ai_tone = v_release.ai_tone,
      ai_instructions = v_release.ai_instructions
  where id = p_business_id;

  return v_release;
end;
$$;

revoke all on function publish_prompt_release(uuid, uuid, text) from public, anon;
grant execute on function publish_prompt_release(uuid, uuid, text) to authenticated, service_role;

-- ===== verification =====  (every ok should be true)
select 'update_business_settings exists' as check_name,
       exists (select 1 from pg_proc where proname = 'update_business_settings') as ok
union all select 'publish_prompt_release is security definer',
       (select prosecdef from pg_proc where proname = 'publish_prompt_release' limit 1)
union all select 'anon cannot run update_business_settings',
       not has_function_privilege('anon', 'public.update_business_settings(uuid, boolean, boolean, text, text, boolean)', 'execute')
union all select 'grounding columns exist',
       (select count(*) = 2 from information_schema.columns
         where table_name = 'businesses' and column_name in ('grounding_review_level', 'grounding_escalate_repeat'));
