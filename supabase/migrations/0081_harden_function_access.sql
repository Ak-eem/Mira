-- Hardening from the Supabase security advisor. No behaviour change for signed-in users or the app's server code.
--
-- 1. Signed-out visitors (the anon role) could call these SECURITY DEFINER functions through the public API. Each one
--    already refuses a caller who is not signed in and authorised, so nothing was exposed; this just stops the call
--    reaching the function at all. (A plain "revoke from public" does not remove the anon grant Supabase adds by default.)
--    The is_business_* / is_platform_admin helpers are left alone on purpose: row-level-security policies call them.
revoke execute on function public.approve_scrape_draft(uuid, text) from anon;
revoke execute on function public.reject_scrape_draft(uuid) from anon;
revoke execute on function public.ensure_inbound_email_address(uuid, text) from anon;
revoke execute on function public.provision_business_trial(uuid, uuid) from anon;
revoke execute on function public.provision_new_business(text, uuid) from anon;
revoke execute on function public.set_business_type(uuid, text) from anon;

-- 2. Pin the search path on functions that had none, so a look-alike object in another schema can never be picked up.
alter function public.normalize_team_invite_email() set search_path = public;
alter function public.update_updated_at_column() set search_path = public;
alter function public.prevent_published_release_mutation() set search_path = public;
alter function public.upsert_prompt_draft(uuid, text, text, text, text) set search_path = public;
