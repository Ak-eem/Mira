-- Paid access: the write lock when a trial or paid period ends, activation, replay protection, manual grants, the
-- platform-admin bypass and who may call activation (migrations 0027, 0067, 0077). Rolls back, safe anywhere.
--
-- Ported from the manual billing scenarios of the closed branch fix/review-findings, which printed output for a person
-- to eyeball and targeted an older activation function. This version asserts every result against the real migrations.
-- Refunds and chargebacks have their own test (paystack_refunds.sql) and are not repeated here.
--
-- The test runs as the database owner with no signed-in user (so it is not a platform admin and the lock applies),
-- except scenario 12, which sets a signed-in admin on purpose. Money is in kobo.
begin;

create function pg_temp.check_that(ok boolean, msg text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'FAILED: %', msg; end if; end $$;

create function pg_temp.near(a timestamptz, b timestamptz) returns boolean language sql as $$
  select abs(extract(epoch from (a - b))) < 120 $$;

-- Runs a statement that MUST fail, with a message matching the pattern; anything else fails the test.
create function pg_temp.expect_error(stmt text, pattern text, msg text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'no error was raised';
exception when others then
  if sqlerrm !~ pattern then raise exception 'FAILED: % (expected an error like "%", got "%")', msg, pattern, sqlerrm; end if;
end $$;

-- A business with an owner and no subscription row, so each scenario controls its own state.
create function pg_temp.mk(slug text, out biz uuid, out usr uuid) language plpgsql as $$
begin
  usr := gen_random_uuid(); biz := gen_random_uuid();
  insert into auth.users(id, email) values (usr, slug || '@test.local');
  insert into businesses(id, name, slug) values (biz, slug, slug);
  insert into business_owners(business_id, user_id, role) values (biz, usr, 'owner');
  delete from business_subscriptions where business_id = biz;
end $$;

create function pg_temp.pay(biz uuid, usr uuid, ref text, new_end timestamptz, amount int default 1000000, expected int default 1000000) returns void language plpgsql as $$
begin
  perform activate_paystack_subscription(biz, usr, ref, amount, new_end, expected, 'base', 30);
end $$;

create function pg_temp.write(biz uuid) returns void language plpgsql as $$
begin insert into products (business_id, name, price) values (biz, 'probe', 1); end $$;

do $$
declare
  b uuid; u uuid; b2 uuid; u2 uuid; s business_subscriptions%rowtype; n int; stranger uuid := gen_random_uuid();
  locked constant text := 'SUBSCRIPTION_REQUIRED';
begin
  -- 1. an ended trial locks writes; a running one does not
  select * into b, u from pg_temp.mk('bill-1');
  insert into business_subscriptions (business_id, status, trial_started_at, trial_ends_at) values (b, 'trialing', now() - interval '20 days', now() - interval '6 days');
  perform pg_temp.expect_error(format('select pg_temp.write(%L)', b), locked, 'an expired trial must block writes');
  update business_subscriptions set trial_ends_at = now() + interval '3 days' where business_id = b;
  perform pg_temp.write(b);

  -- 2. activation: a payment buys the period, records the reference, and unlocks writes
  select * into b, u from pg_temp.mk('bill-2');
  insert into business_subscriptions (business_id, status, trial_started_at, trial_ends_at) values (b, 'trialing', now() - interval '20 days', now() - interval '6 days');
  perform pg_temp.pay(b, u, 'ref-2a', now() + interval '30 days');
  select * into s from business_subscriptions where business_id = b;
  perform pg_temp.check_that(s.status = 'active' and s.reference = 'ref-2a' and s.amount = 1000000, 'activation sets active, the reference and the amount');
  perform pg_temp.check_that(pg_temp.near(s.expires_at, now() + interval '30 days'), 'activation sets the paid period end');
  perform pg_temp.check_that((select count(*) from paystack_payments where reference = 'ref-2a' and business_id = b) = 1, 'activation records the payment once');
  perform pg_temp.write(b);

  -- 3. replaying the same reference is a no-op, even with a different expiry
  perform pg_temp.pay(b, u, 'ref-2a', now() + interval '300 days');
  select * into s from business_subscriptions where business_id = b;
  perform pg_temp.check_that(pg_temp.near(s.expires_at, now() + interval '30 days'), 'a replayed reference must not change the expiry');
  perform pg_temp.check_that((select count(*) from paystack_payments where business_id = b) = 1, 'a replayed reference must not add a second payment');

  -- 4. an early renewal moves the expiry to what the server computed, and becomes the current reference
  perform pg_temp.pay(b, u, 'ref-2b', now() + interval '60 days');
  select * into s from business_subscriptions where business_id = b;
  perform pg_temp.check_that(s.reference = 'ref-2b' and pg_temp.near(s.expires_at, now() + interval '60 days'), 'a renewal stacks onto the expiry the server computed');

  -- 4b. replaying the OLD reference after the renewal changes nothing
  perform pg_temp.pay(b, u, 'ref-2a', now() + interval '30 days');
  select * into s from business_subscriptions where business_id = b;
  perform pg_temp.check_that(s.reference = 'ref-2b' and pg_temp.near(s.expires_at, now() + interval '60 days'), 'replaying an old reference must not roll the subscription back');

  -- 5. a lapsed paid period locks writes; deleting stays possible so an owner can still tidy up
  perform pg_temp.write(b);
  update business_subscriptions set expires_at = now() - interval '1 day' where business_id = b;
  perform pg_temp.expect_error(format('select pg_temp.write(%L)', b), locked, 'a lapsed paid period must block writes');
  delete from products where business_id = b;
  perform pg_temp.check_that((select count(*) from products where business_id = b) = 0, 'deleting must still work when locked');

  -- 6. renewing after a lapse starts from the new expiry and unlocks writes again
  perform pg_temp.pay(b, u, 'ref-2c', now() + interval '30 days');
  select * into s from business_subscriptions where business_id = b;
  perform pg_temp.check_that(s.status = 'active' and pg_temp.near(s.expires_at, now() + interval '30 days'), 'renewal after a lapse reactivates');
  perform pg_temp.write(b);

  -- 7. a cancelled subscription locks writes
  update business_subscriptions set status = 'cancelled' where business_id = b;
  perform pg_temp.expect_error(format('select pg_temp.write(%L)', b), locked, 'a cancelled subscription must block writes');

  -- 8. bad input is rejected and changes nothing
  select * into b2, u2 from pg_temp.mk('bill-8');
  perform pg_temp.expect_error(format('select pg_temp.pay(%L, %L, %L, now() + interval ''30 days'', 100, 1000000)', b2, u2, 'ref-8a'), 'invalid Paystack activation input', 'paid amount must equal the expected amount');
  perform pg_temp.expect_error(format('select pg_temp.pay(%L, %L, %L, now() - interval ''1 day'')', b2, u2, 'ref-8b'), 'invalid Paystack activation input', 'the new expiry must be in the future');
  perform pg_temp.expect_error(format('select activate_paystack_subscription(%L, %L, %L, 1000000, now() + interval ''30 days'', 1000000, ''pro'', 30)', b2, u2, 'ref-8c'), 'invalid Paystack activation input', 'only the base plan is accepted');
  perform pg_temp.expect_error(format('select activate_paystack_subscription(%L, %L, %L, 1000000, now() + interval ''30 days'', 1000000, ''base'', 0)', b2, u2, 'ref-8d'), 'invalid Paystack activation input', 'a zero-day period is rejected');
  perform pg_temp.expect_error(format('select activate_paystack_subscription(%L, %L, null, 1000000, now() + interval ''30 days'', 1000000, ''base'', 30)', b2, u2), 'invalid Paystack activation input', 'a missing reference is rejected');
  perform pg_temp.check_that((select count(*) from paystack_payments where business_id = b2) = 0 and not exists (select 1 from business_subscriptions where business_id = b2), 'rejected input must record nothing');

  -- 9. only an owner of the business can activate it
  insert into auth.users(id, email) values (stranger, 'stranger@test.local');
  perform pg_temp.expect_error(format('select pg_temp.pay(%L, %L, %L, now() + interval ''30 days'')', b2, stranger, 'ref-9'), 'no longer associated', 'a non-owner must not be able to activate a business');

  -- 10. a reference already used by one business cannot be used by another (ledger and subscription row)
  perform pg_temp.expect_error(format('select pg_temp.pay(%L, %L, %L, now() + interval ''30 days'')', b2, u2, 'ref-2b'), 'already been used', 'a reference from another business must be refused');

  -- 11. a manual grant (active, no expiry) never lapses
  select * into b2, u2 from pg_temp.mk('bill-11');
  insert into business_subscriptions (business_id, status, expires_at) values (b2, 'active', null);
  perform pg_temp.write(b2);

  -- 12. a signed-in platform admin bypasses the lock
  declare admin_id uuid := gen_random_uuid();
  begin
    insert into auth.users(id, email) values (admin_id, 'admin@bill.test');
    insert into platform_admins(id, email) values (admin_id, 'admin@bill.test');
    update business_subscriptions set status = 'cancelled' where business_id = b2;
    perform pg_temp.expect_error(format('select pg_temp.write(%L)', b2), locked, 'precondition: the business is locked for everyone else');
    perform set_config('request.jwt.claim.sub', admin_id::text, true);
    perform pg_temp.write(b2);
    perform set_config('request.jwt.claim.sub', '', true);
  end;

  -- 13. only the server may activate: clients cannot, the service role can
  perform pg_temp.check_that(not has_function_privilege('anon', 'activate_paystack_subscription(uuid,uuid,text,integer,timestamptz,integer,text,integer)', 'execute'), 'anon must not be able to activate');
  perform pg_temp.check_that(not has_function_privilege('authenticated', 'activate_paystack_subscription(uuid,uuid,text,integer,timestamptz,integer,text,integer)', 'execute'), 'signed-in users must not be able to activate');
  perform pg_temp.check_that(has_function_privilege('service_role', 'activate_paystack_subscription(uuid,uuid,text,integer,timestamptz,integer,text,integer)', 'execute'), 'the server must be able to activate');
  perform pg_temp.check_that(not has_table_privilege('authenticated', 'public.paystack_payments', 'select'), 'clients must not be able to read the payment ledger');
  select count(*) into n from pg_proc where proname = 'activate_paystack_subscription';
  perform pg_temp.check_that(n = 1, format('exactly one activation function must exist (the old overload must be gone), found %s', n));

  raise notice 'billing activation: ok';
end $$;

rollback;

do $$ begin raise notice 'BILLING ACTIVATION CHECKS PASSED'; end $$;
