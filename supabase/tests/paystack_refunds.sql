-- Refunds and chargebacks (migration 0075). Rolls back, safe anywhere.
-- Time is simulated by moving paystack_payments.created_at back, since now() is fixed inside a
-- transaction. Numbers: a payment buys 30 days; amounts are kobo.
begin;

create function pg_temp.check_that(ok boolean, msg text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'FAILED: %', msg; end if; end $$;

create function pg_temp.near(a timestamptz, b timestamptz) returns boolean language sql as $$
  select abs(extract(epoch from (a - b))) < 120 $$;

-- A business with an owner and no subscription row yet.
create function pg_temp.mk(slug text, out biz uuid, out usr uuid) language plpgsql as $$
begin
  usr := gen_random_uuid(); biz := gen_random_uuid();
  insert into auth.users(id, email) values (usr, slug || '@test.local');
  insert into businesses(id, name, slug) values (biz, slug, slug);
  insert into business_owners(business_id, user_id, role) values (biz, usr, 'owner');
  delete from business_subscriptions where business_id = biz;
end $$;

-- Record a payment the way the webhook does. `ago` = how long ago it was made; `new_end` = the
-- subscription's new expiry (the server computes this with nextPeriodEnd).
create function pg_temp.pay(biz uuid, usr uuid, ref text, ago interval, new_end timestamptz, tracked boolean default true) returns void language plpgsql as $$
begin
  if tracked then
    perform activate_paystack_subscription(biz, usr, ref, 5000000, new_end, 5000000, 'base', 30);
  else
    perform activate_paystack_subscription(p_business_id => biz, p_user_id => usr, p_reference => ref,
      p_amount => 5000000, p_expires_at => new_end, p_expected_amount_kobo => 5000000);
  end if;
  update paystack_payments set created_at = now() - ago where reference = ref;
end $$;

do $$
declare
  b uuid; u uuid; r jsonb; s business_subscriptions%rowtype; pay_row paystack_payments%rowtype;
begin
  -- 1. activation records what the payment bought and the coverage that existed before it
  select * into b, u from pg_temp.mk('refund-1');
  perform pg_temp.pay(b, u, 'r1-a', interval '10 days', now() + interval '20 days');
  perform pg_temp.pay(b, u, 'r1-b', interval '0', now() + interval '50 days');
  select * into pay_row from paystack_payments where reference = 'r1-a';
  perform pg_temp.check_that(pay_row.period_days = 30 and pay_row.prev_expires_at is null, 'first payment: 30 days, no earlier coverage');
  select * into pay_row from paystack_payments where reference = 'r1-b';
  perform pg_temp.check_that(pay_row.period_days = 30 and pg_temp.near(pay_row.prev_expires_at, now() + interval '20 days'), 'early renewal remembers the coverage it stacked onto');

  -- 2. refund the EARLIER payment: only its days go; the later payment keeps its full 30 days
  r := refund_paystack_payment('r1-a');
  select * into s from business_subscriptions where business_id = b;
  perform pg_temp.check_that(r->>'outcome' = 'shortened', 'earlier refund shortens: ' || r::text);
  perform pg_temp.check_that(s.status = 'active' and pg_temp.near(s.expires_at, now() + interval '30 days'), 'later payment keeps its 30 days from when it was made');

  -- 3. replaying that refund changes nothing
  r := refund_paystack_payment('r1-a');
  select * into s from business_subscriptions where business_id = b;
  perform pg_temp.check_that(r->>'outcome' = 'already_applied' and pg_temp.near(s.expires_at, now() + interval '30 days'), 'a replayed refund is not applied twice');

  -- 4. refunding the last payment too cancels
  r := refund_paystack_payment('r1-b');
  select * into s from business_subscriptions where business_id = b;
  perform pg_temp.check_that(r->>'outcome' = 'revoked' and s.status = 'cancelled', 'refunding everything cancels: ' || r::text);

  -- 5. refund the LATEST payment first: the earlier payment's remaining days survive
  select * into b, u from pg_temp.mk('refund-2');
  perform pg_temp.pay(b, u, 'r2-a', interval '10 days', now() + interval '20 days');
  perform pg_temp.pay(b, u, 'r2-b', interval '0', now() + interval '50 days');
  r := refund_paystack_payment('r2-b');
  select * into s from business_subscriptions where business_id = b;
  perform pg_temp.check_that(r->>'outcome' = 'shortened' and s.status = 'active' and pg_temp.near(s.expires_at, now() + interval '20 days'), 'latest refund leaves the earlier payment''s remaining 20 days: ' || r::text);
  r := refund_paystack_payment('r2-a');
  select * into s from business_subscriptions where business_id = b;
  perform pg_temp.check_that(r->>'outcome' = 'revoked' and s.status = 'cancelled', 'then refunding the earlier one cancels');

  -- 6. a refund of a single payment cancels
  select * into b, u from pg_temp.mk('refund-3');
  perform pg_temp.pay(b, u, 'r3-a', interval '0', now() + interval '30 days');
  r := refund_paystack_payment('r3-a', 5000000);
  select * into s from business_subscriptions where business_id = b;
  perform pg_temp.check_that(r->>'outcome' = 'revoked' and s.status = 'cancelled', 'refund of the only payment cancels');
  select * into pay_row from paystack_payments where reference = 'r3-a';
  perform pg_temp.check_that(pay_row.refunded_amount = 5000000 and pay_row.refunded_at is not null and pay_row.access_revoked_at is not null, 'the refund is recorded on the payment');

  -- 7. partial refunds are recorded but change nothing; reaching the full amount applies it
  select * into b, u from pg_temp.mk('refund-4');
  perform pg_temp.pay(b, u, 'r4-a', interval '0', now() + interval '30 days');
  r := refund_paystack_payment('r4-a', 2000000);
  select * into s from business_subscriptions where business_id = b;
  perform pg_temp.check_that(r->>'outcome' = 'partial_recorded' and s.status = 'active', 'a partial refund keeps access');
  r := refund_paystack_payment('r4-a', 1000000);
  perform pg_temp.check_that(r->>'outcome' = 'partial_recorded', 'a smaller later amount never lowers what was recorded');
  r := refund_paystack_payment('r4-a', 5000000);
  select * into s from business_subscriptions where business_id = b;
  perform pg_temp.check_that(r->>'outcome' = 'revoked' and s.status = 'cancelled', 'once refunds reach the full amount it is applied');

  -- 8. refunding a payment whose days were already used up changes nothing
  select * into b, u from pg_temp.mk('refund-5');
  perform pg_temp.pay(b, u, 'r5-a', interval '100 days', now() + interval '30 days');
  update business_subscriptions set expires_at = now() - interval '70 days' where business_id = b;
  perform pg_temp.pay(b, u, 'r5-b', interval '0', now() + interval '30 days');
  r := refund_paystack_payment('r5-a');
  select * into s from business_subscriptions where business_id = b;
  perform pg_temp.check_that(r->>'outcome' = 'unchanged' and s.status = 'active' and pg_temp.near(s.expires_at, now() + interval '30 days'), 'refund of a long-expired payment leaves current access alone: ' || r::text);

  -- 9. an admin's manual extension is preserved through a refund
  select * into b, u from pg_temp.mk('refund-6');
  perform pg_temp.pay(b, u, 'r6-a', interval '10 days', now() + interval '20 days');
  perform pg_temp.pay(b, u, 'r6-b', interval '0', now() + interval '50 days');
  update business_subscriptions set expires_at = expires_at + interval '14 days' where business_id = b;
  r := refund_paystack_payment('r6-a');
  select * into s from business_subscriptions where business_id = b;
  perform pg_temp.check_that(pg_temp.near(s.expires_at, now() + interval '44 days'), 'a manual +14 days survives the refund (30 + 14)');

  -- 10. payments from before day-tracking keep the old behaviour, and say so when they cannot be handled
  select * into b, u from pg_temp.mk('refund-7');
  perform pg_temp.pay(b, u, 'r7-a', interval '10 days', now() + interval '20 days', false);
  select * into pay_row from paystack_payments where reference = 'r7-a';
  perform pg_temp.check_that(pay_row.period_days is null, 'an activation without period_days still works and is recorded as untracked');
  r := refund_paystack_payment('r7-a');
  select * into s from business_subscriptions where business_id = b;
  perform pg_temp.check_that(r->>'outcome' = 'revoked' and s.status = 'cancelled', 'untracked current payment: cancelled as before');

  select * into b, u from pg_temp.mk('refund-8');
  perform pg_temp.pay(b, u, 'r8-a', interval '10 days', now() + interval '20 days', false);
  perform pg_temp.pay(b, u, 'r8-b', interval '0', now() + interval '50 days', false);
  r := refund_paystack_payment('r8-a');
  select * into s from business_subscriptions where business_id = b;
  perform pg_temp.check_that(r->>'outcome' = 'needs_review' and s.status = 'active', 'untracked, not-current payment is flagged for review, not silently ignored: ' || r::text);

  -- 11. unknown / blank references
  perform pg_temp.check_that(refund_paystack_payment('does-not-exist')->>'outcome' = 'unknown_reference', 'unknown reference is reported');
  perform pg_temp.check_that(refund_paystack_payment('   ')->>'outcome' = 'unknown_reference', 'a blank reference is reported');

  -- 12. chargebacks are recorded, once, without touching access
  select * into b, u from pg_temp.mk('refund-9');
  perform pg_temp.pay(b, u, 'r9-a', interval '0', now() + interval '30 days');
  r := record_paystack_dispute('r9-a');
  perform pg_temp.check_that(r->>'outcome' = 'recorded' and (r->>'first_time')::boolean and (r->>'business_id')::uuid = b, 'first chargeback is recorded: ' || r::text);
  r := record_paystack_dispute('r9-a');
  perform pg_temp.check_that((r->>'first_time')::boolean = false, 'a repeated chargeback event is not first_time');
  select * into s from business_subscriptions where business_id = b;
  perform pg_temp.check_that(s.status = 'active', 'a chargeback does not change access');
  perform pg_temp.check_that(record_paystack_dispute('nope')->>'outcome' = 'unknown_reference', 'a chargeback on an unknown payment is reported');

  -- 13. bad input is rejected
  begin
    perform activate_paystack_subscription(b, u, 'bad-days', 5000000, now() + interval '30 days', 5000000, 'base', 0);
    raise exception 'FAILED: a zero-day payment should be rejected';
  exception when others then
    if sqlerrm like 'FAILED:%' then raise; end if;
  end;

  -- 14. the new functions are not callable by customers
  perform pg_temp.check_that(not has_function_privilege('authenticated', 'refund_paystack_payment(text,integer)', 'execute'), 'customers cannot call refund_paystack_payment');
  perform pg_temp.check_that(not has_function_privilege('anon', 'record_paystack_dispute(text)', 'execute'), 'anonymous visitors cannot call record_paystack_dispute');
  perform pg_temp.check_that(not has_function_privilege('authenticated', 'paystack_coverage_end(uuid,text)', 'execute'), 'customers cannot call paystack_coverage_end');
  perform pg_temp.check_that(has_function_privilege('service_role', 'refund_paystack_payment(text,integer)', 'execute'), 'the server can call refund_paystack_payment');

  raise notice 'PAYSTACK REFUND CHECKS PASSED';
end $$;
rollback;
