-- Billing SQL scenarios (expiry, renewal stacking, replay of old references, refunds,
-- grants). Needs a throwaway local Postgres, NOT your Supabase project:
--   createdb mira_test && psql -d mira_test -f supabase/tests/billing.test.sql
-- Run from the repo root. Each cho header says what to expect; ERROR lines marked
-- 'expected' are the point of the test. It drops/recreates schemas public and auth.

\set ON_ERROR_STOP off
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$; do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$; do $$ begin create role service_role nologin; exception when duplicate_object then null; end $$;
\i supabase/tests/billing_harness.sql
\i supabase/migrations/0056_billing_expiry_and_renewal.sql
create trigger t_products before insert or update or delete on products for each row execute function enforce_active_business_subscription();

insert into auth.users values ('22222222-2222-2222-2222-222222222222');
insert into businesses (id,name) values ('11111111-1111-1111-1111-111111111111','B1');
insert into business_owners (business_id,user_id) values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222');

\echo === 1. expired trial blocks writes
insert into business_subscriptions (business_id,status,trial_started_at,trial_ends_at) values ('11111111-1111-1111-1111-111111111111','trialing',now()-interval '20 days',now()-interval '6 days');
insert into products (business_id,name) values ('11111111-1111-1111-1111-111111111111','x');

\echo === 2. activate: paid 30 days
select activate_paystack_subscription('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','ref_1',1000000,30,1000000);
select status, reference, round(extract(epoch from (expires_at-now()))/86400) as days_left from business_subscriptions;
insert into products (business_id,name) values ('11111111-1111-1111-1111-111111111111','allowed after payment') returning name;

\echo === 3. replay same reference is a no-op (days_left stays ~30)
select activate_paystack_subscription('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','ref_1',1000000,30,1000000);
select round(extract(epoch from (expires_at-now()))/86400) as days_left from business_subscriptions;

\echo === 4. early renewal stacks (expect ~60)
select activate_paystack_subscription('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','ref_2',1000000,30,1000000);
select reference, round(extract(epoch from (expires_at-now()))/86400) as days_left from business_subscriptions;

\echo === 4b. replaying OLD reference ref_1 after ref_2 must be a no-op (still ~60, reference still ref_2)
select activate_paystack_subscription('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','ref_1',1000000,30,1000000);
select activate_paystack_subscription('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','ref_2',1000000,30,1000000);
select activate_paystack_subscription('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','ref_1',1000000,30,1000000);
select reference, round(extract(epoch from (expires_at-now()))/86400) as days_left from business_subscriptions;
\echo === 5. lapse: expires_at in the past locks writes
update business_subscriptions set expires_at = now()-interval '1 day';
insert into products (business_id,name) values ('11111111-1111-1111-1111-111111111111','should fail');

\echo === 6. renewal after lapse restarts from now (expect ~30)
select activate_paystack_subscription('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','ref_3',1000000,30,1000000);
select round(extract(epoch from (expires_at-now()))/86400) as days_left from business_subscriptions;

\echo === 7. refund revokes (partial refund first = no change)
select revoke_paystack_subscription('ref_3', 5000);
select status from business_subscriptions;
select revoke_paystack_subscription('ref_3', 1000000);
select status from business_subscriptions;
insert into products (business_id,name) values ('11111111-1111-1111-1111-111111111111','blocked after refund');

\echo === 8. late replay of the refunded charge.success must NOT reactivate
select activate_paystack_subscription('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','ref_3',1000000,30,1000000);
select status from business_subscriptions;

\echo === 9. amount mismatch / bad input rejected
select activate_paystack_subscription('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','ref_4',100,30,1000000);
select activate_paystack_subscription('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','ref_4',1000000,0,1000000);

\echo === 10. non-owner cannot activate; reference reuse across businesses rejected
insert into auth.users values ('33333333-3333-3333-3333-333333333333');
select activate_paystack_subscription('11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333','ref_5',1000000,30,1000000);
insert into businesses (id,name) values ('44444444-4444-4444-4444-444444444444','B2');
insert into business_owners (business_id,user_id) values ('44444444-4444-4444-4444-444444444444','22222222-2222-2222-2222-222222222222');
select activate_paystack_subscription('44444444-4444-4444-4444-444444444444','22222222-2222-2222-2222-222222222222','ref_2',1000000,30,1000000);

\echo === 11. manual admin grant (expires_at null) never lapses
update business_subscriptions set status='active', expires_at=null where business_id='11111111-1111-1111-1111-111111111111';
insert into products (business_id,name) values ('11111111-1111-1111-1111-111111111111','manual grant ok') returning name;

\echo === 12. platform admin bypasses the lock
update business_subscriptions set status='cancelled';
set test.admin = 'on';
insert into products (business_id,name) values ('11111111-1111-1111-1111-111111111111','admin bypass ok') returning name;
set test.admin = 'off';

\echo === 13. anon/authenticated cannot call the RPCs; service_role can
select has_function_privilege('anon','activate_paystack_subscription(uuid,uuid,text,integer,integer,integer,text)','execute') as anon_activate,
       has_function_privilege('authenticated','activate_paystack_subscription(uuid,uuid,text,integer,integer,integer,text)','execute') as auth_activate,
       has_function_privilege('service_role','activate_paystack_subscription(uuid,uuid,text,integer,integer,integer,text)','execute') as svc_activate,
       has_function_privilege('anon','revoke_paystack_subscription(text,integer)','execute') as anon_revoke,
       has_function_privilege('service_role','revoke_paystack_subscription(text,integer)','execute') as svc_revoke;
