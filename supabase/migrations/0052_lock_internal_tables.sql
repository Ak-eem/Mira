-- Security hardening: six tables were created without row-level security and
-- without revoking Supabase's default grants, so anyone holding the public
-- anon key (it ships in every browser bundle) could read and write them
-- straight through the REST API.
--
--   whatsapp_inbound_queue, email_inbound_queue  raw customer messages, phone numbers
--   rate_limit_buckets                           keys embed visitor ids (the web-chat "password")
--                                                and IPs; deleting rows also resets limits
--   conversation_processing_leases               lease keys; writable = can block replies
--   prompt_releases                              every business's AI instructions + history
--
-- All of the first four are only ever touched by server code using the
-- service-role key (lib/chat/durable.ts, lib/*/inboundQueue.ts, lib/rateLimit.ts),
-- which bypasses RLS, so locking them changes nothing for the app.
--
-- prompt_releases IS used with the logged-in user's session (portal + admin
-- prompt editors), so it gets policies that mirror the app's own rules:
--   * platform admins: everything
--   * business staff and owners: read, and save drafts
--   * business owners only: publish (a draft -> published flip) -- the same
--     rule promotePromptRelease enforces in app code, now enforced by the DB too.
--
-- Safe to re-run.
--
-- ROLLBACK if the prompt editor misbehaves after this (leaves the other five locked):
--   alter table prompt_releases disable row level security;

-- 1. Server-only tables: RLS on, no policies, no client privileges.
alter table whatsapp_inbound_queue enable row level security;
alter table email_inbound_queue enable row level security;
alter table rate_limit_buckets enable row level security;
alter table conversation_processing_leases enable row level security;

revoke all on table whatsapp_inbound_queue from anon, authenticated;
revoke all on table email_inbound_queue from anon, authenticated;
revoke all on table rate_limit_buckets from anon, authenticated;
revoke all on table conversation_processing_leases from anon, authenticated;

-- 2. consume_rate_limit is SECURITY DEFINER, so RLS would not stop a caller
--    from burning or resetting anyone's bucket by passing an arbitrary key.
--    The app only calls it with the service-role key.
revoke execute on function consume_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function consume_rate_limit(text, integer, integer) to service_role;

-- 3. prompt_releases: RLS with policies that match the portal's role rules.
alter table prompt_releases enable row level security;
revoke all on table prompt_releases from anon;

drop policy if exists prompt_releases_admin_all on prompt_releases;
create policy prompt_releases_admin_all on prompt_releases
  for all to authenticated
  using (is_platform_admin())
  with check (is_platform_admin());

drop policy if exists prompt_releases_member_select on prompt_releases;
create policy prompt_releases_member_select on prompt_releases
  for select to authenticated
  using (is_business_member(business_id));

drop policy if exists prompt_releases_member_insert_draft on prompt_releases;
create policy prompt_releases_member_insert_draft on prompt_releases
  for insert to authenticated
  with check (status = 'draft' and is_business_member(business_id));

drop policy if exists prompt_releases_member_update on prompt_releases;
create policy prompt_releases_member_update on prompt_releases
  for update to authenticated
  using (is_business_member(business_id))
  with check (status = 'draft' or is_business_admin(business_id));

-- The two prompt functions run as the caller (SECURITY INVOKER), so with the
-- policies above they only work for people allowed to touch that business.
revoke execute on function upsert_prompt_draft(uuid, text, text, text, text) from public, anon;
revoke execute on function publish_prompt_release(uuid, uuid, text) from public, anon;
grant execute on function upsert_prompt_draft(uuid, text, text, text, text) to authenticated, service_role;
grant execute on function publish_prompt_release(uuid, uuid, text) to authenticated, service_role;

-- ===== verification =====
-- Every "ok" should be true.
select 'RLS on whatsapp_inbound_queue' as check_name,
       (select relrowsecurity from pg_class where oid = 'public.whatsapp_inbound_queue'::regclass) as ok
union all select 'RLS on email_inbound_queue',
       (select relrowsecurity from pg_class where oid = 'public.email_inbound_queue'::regclass)
union all select 'RLS on rate_limit_buckets',
       (select relrowsecurity from pg_class where oid = 'public.rate_limit_buckets'::regclass)
union all select 'RLS on conversation_processing_leases',
       (select relrowsecurity from pg_class where oid = 'public.conversation_processing_leases'::regclass)
union all select 'RLS on prompt_releases',
       (select relrowsecurity from pg_class where oid = 'public.prompt_releases'::regclass)
union all select 'anon cannot read whatsapp_inbound_queue',
       not has_table_privilege('anon', 'public.whatsapp_inbound_queue', 'select')
union all select 'anon cannot read email_inbound_queue',
       not has_table_privilege('anon', 'public.email_inbound_queue', 'select')
union all select 'anon cannot read rate_limit_buckets',
       not has_table_privilege('anon', 'public.rate_limit_buckets', 'select')
union all select 'anon cannot read prompt_releases',
       not has_table_privilege('anon', 'public.prompt_releases', 'select')
union all select 'anon cannot run consume_rate_limit',
       not has_function_privilege('anon', 'public.consume_rate_limit(text, integer, integer)', 'execute');
