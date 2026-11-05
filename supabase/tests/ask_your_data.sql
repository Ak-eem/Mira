-- Tests for the "ask your data" lookups (migration 0068).
-- Everything runs inside a transaction that is rolled back. A failure raises (non-zero exit); a pass ends
-- with "ASK YOUR DATA CHECKS PASSED".
--
-- 1. correctness: counts, revenue, wildcard escaping
-- 2. time: hour / weekday buckets follow the business's timezone, not UTC (Lagos is UTC+1)
-- 3. isolation: a signed-in owner who passes ANOTHER business's id gets nothing; anon cannot call at all

begin;

create temp table _ids (k text primary key, v uuid);
grant all on _ids to authenticated, anon;

do $$
declare
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid();
  ba uuid := gen_random_uuid(); bb uuid := gen_random_uuid();
  c_old uuid := gen_random_uuid(); c1 uuid := gen_random_uuid(); c2 uuid := gen_random_uuid(); c3 uuid := gen_random_uuid(); cb uuid := gen_random_uuid();
begin
  insert into auth.users(id, email) values (ua, 'a@ask.local'), (ub, 'b@ask.local');
  insert into businesses(id, name, slug) values (ba, 'Ask A', 'ask-a'), (bb, 'Ask B', 'ask-b');
  insert into business_subscriptions(business_id, status) values (ba, 'active'), (bb, 'active');
  insert into business_owners(business_id, user_id, role) values (ba, ua, 'owner'), (bb, ub, 'owner');

  -- c_old: a visitor who chatted BEFORE the range; c1 is the same visitor coming back inside it.
  insert into conversations(id, business_id, session_token, channel, started_at, needs_human, status, customer_rating)
  values
    (c_old, ba, 'visitor-1', 'web',      '2026-10-20 10:00:00+00', false, 'closed', null),
    (c1,    ba, 'visitor-1', 'web',      '2026-11-01 23:30:00+00', true,  'open',   null),
    (c2,    ba, 'visitor-2', 'whatsapp', '2026-11-02 17:10:00+00', false, 'closed', 5),
    (c3,    ba, 'visitor-3', 'web',      '2026-11-02 18:05:00+00', false, 'closed', 4),
    (cb,    bb, 'visitor-9', 'web',      '2026-11-02 17:10:00+00', false, 'open',   null);

  insert into messages(conversation_id, business_id, role, content, created_at) values
    -- 23:30 UTC on Sunday = 00:30 Monday in Lagos
    (c1, ba, 'customer',  'Can I get a REFUND on my order?',         '2026-11-01 23:30:00+00'),
    -- 17:10 and 17:50 UTC = 18:10 and 18:50 in Lagos
    (c2, ba, 'customer',  'what is your return policy',              '2026-11-02 17:10:00+00'),
    (c2, ba, 'assistant', 'Returns are accepted within 7 days.',     '2026-11-02 17:20:00+00'),
    (c2, ba, 'customer',  'do you deliver to Ikeja',                 '2026-11-02 17:50:00+00'),
    -- 18:05 UTC = 19:05 in Lagos
    (c3, ba, 'customer',  'do you deliver to Ikeja',                 '2026-11-02 18:05:00+00'),
    (c3, ba, 'customer',  'it is 100% sure_thing',                   '2026-11-02 18:06:00+00'),
    (c_old, ba, 'customer', 'hello there from before',               '2026-10-20 10:00:00+00'),
    (cb, bb, 'customer',  'secret refund question for B',            '2026-11-02 17:10:00+00');

  insert into orders(business_id, customer_identifier, status, total, created_at) values
    (ba, 'web_x', 'placed',    100, '2026-11-02 10:00:00+00'),
    (ba, 'web_y', 'delivered',  50, '2026-11-02 11:00:00+00'),
    (ba, 'web_z', 'cancelled',  70, '2026-11-02 12:00:00+00'),
    (ba, 'web_w', 'cart',      999, '2026-11-02 13:00:00+00'),
    (bb, 'web_q', 'placed',    500, '2026-11-02 10:00:00+00');

  insert into _ids values ('ua', ua), ('ub', ub), ('ba', ba), ('bb', bb);
end $$;

create function pg_temp.as_user(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true);
  perform set_config('request.jwt.claim.role', case when p_user is null then 'anon' else 'authenticated' end, true);
  execute case when p_user is null then 'set local role anon' else 'set local role authenticated' end;
end $$;
create function pg_temp.as_postgres() returns void language plpgsql as $$
begin execute 'reset role'; end $$;
grant execute on function pg_temp.as_user(uuid), pg_temp.as_postgres() to public;

do $$
declare
  ua uuid; ba uuid; bb uuid;
  failures text := '';
  r jsonb; cnt bigint; t text;
  from_ts timestamptz := '2026-11-01 00:00:00+00';
  to_ts   timestamptz := '2026-11-03 00:00:00+00';
begin
  select v into ua from _ids where k = 'ua';
  select v into ba from _ids where k = 'ba';
  select v into bb from _ids where k = 'bb';

  perform pg_temp.as_user(ua);

  -- ---- time: hour of day follows the business's timezone -----------------------------------------------
  select string_agg(bucket || '=' || n, ',' order by bucket) into t
    from ask_message_volume(ba, from_ts, to_ts, 'Africa/Lagos', 'hour_of_day', 'customers');
  if t is distinct from '00=1,18=2,19=2' then failures := failures || format(E'\n  Lagos hour buckets: got %s, want 00=1,18=2,19=2', t); end if;

  select string_agg(bucket || '=' || n, ',' order by bucket) into t
    from ask_message_volume(ba, from_ts, to_ts, 'UTC', 'hour_of_day', 'customers');
  if t is distinct from '17=2,18=2,23=1' then failures := failures || format(E'\n  UTC hour buckets: got %s, want 17=2,18=2,23=1 (proves the zone is applied)', t); end if;

  -- 23:30 UTC Sunday is Monday 00:30 in Lagos: all five customer messages are Mondays there
  select string_agg(bucket || '=' || n, ',' order by bucket) into t
    from ask_message_volume(ba, from_ts, to_ts, 'Africa/Lagos', 'weekday', 'customers');
  if t is distinct from '1=5' then failures := failures || format(E'\n  Lagos weekday buckets: got %s, want 1=5', t); end if;

  select string_agg(bucket || '=' || n, ',' order by bucket) into t
    from ask_message_volume(ba, from_ts, to_ts, 'Africa/Lagos', 'day', 'customers');
  if t is distinct from '2026-11-02=5' then failures := failures || format(E'\n  Lagos day buckets: got %s, want 2026-11-02=5', t); end if;

  select sum(n) into cnt from ask_message_volume(ba, from_ts, to_ts, 'Africa/Lagos', 'hour_of_day', 'both');
  if cnt is distinct from 6 then failures := failures || format(E'\n  both roles: got %s, want 6', cnt); end if;
  select sum(n) into cnt from ask_message_volume(ba, from_ts, to_ts, 'Africa/Lagos', 'hour_of_day', 'assistant');
  if cnt is distinct from 1 then failures := failures || format(E'\n  assistant only: got %s, want 1', cnt); end if;

  begin
    perform * from ask_message_volume(ba, from_ts, to_ts, 'Africa/Lagos', 'minute', 'customers');
    failures := failures || E'\n  an unknown bucket should be refused';
  exception when others then null; end;

  -- ---- topic mentions ---------------------------------------------------------------------------------
  r := ask_topic_mentions(ba, from_ts, to_ts, array['refund', 'return policy']);
  if (r->>'messages')::int <> 2 or (r->>'conversations')::int <> 2 then
    failures := failures || format(E'\n  topic refund/return: got %s, want 2 messages in 2 conversations', r);
  end if;
  r := ask_topic_mentions(ba, from_ts, to_ts, array['REFUND']);
  if (r->>'messages')::int <> 1 then failures := failures || format(E'\n  topic match must ignore case: got %s', r); end if;
  -- LIKE wildcards in a term are literal: "100%" matches the one message that says 100%, "sure_thing" only the literal underscore
  r := ask_topic_mentions(ba, from_ts, to_ts, array['100%']);
  if (r->>'messages')::int <> 1 then failures := failures || format(E'\n  percent sign must be literal: got %s, want 1', r); end if;
  r := ask_topic_mentions(ba, from_ts, to_ts, array['sure_thing']);
  if (r->>'messages')::int <> 1 then failures := failures || format(E'\n  underscore must be literal: got %s, want 1', r); end if;
  r := ask_topic_mentions(ba, from_ts, to_ts, array['sureXthing']);
  if (r->>'messages')::int <> 0 then failures := failures || format(E'\n  underscore matched a different character: %s', r); end if;
  begin
    perform ask_topic_mentions(ba, from_ts, to_ts, array['ab']);
    failures := failures || E'\n  a 2-character term should be refused';
  exception when others then null; end;

  -- ---- conversations ---------------------------------------------------------------------------------
  r := ask_conversation_stats(ba, from_ts, to_ts);
  if (r->>'started')::int <> 3 or (r->>'needed_a_human')::int <> 1 or (r->>'closed')::int <> 2
     or (r->>'rated')::int <> 2 or (r->>'average_rating')::numeric <> 4.5 or (r->>'chat_sessions')::int <> 3
     or (r->>'returning_sessions')::int <> 1 or (r->'by_channel'->>'web')::int <> 2 or (r->'by_channel'->>'whatsapp')::int <> 1 then
    failures := failures || format(E'\n  conversation stats wrong: %s', r);
  end if;

  -- ---- orders: carts are not orders; revenue counts placed/shipped/delivered only ---------------------------
  r := ask_orders_summary(ba, from_ts, to_ts);
  if (r->>'orders')::int <> 3 or (r->>'revenue')::numeric <> 150 or (r->>'counted_for_revenue')::int <> 2 or (r->>'cancelled')::int <> 1 then
    failures := failures || format(E'\n  orders summary wrong: %s', r);
  end if;

  -- ---- top questions: identical wording only, at least twice ------------------------------------------------
  select count(*) into cnt from ask_top_questions(ba, from_ts, to_ts, 5);
  if cnt <> 1 then failures := failures || format(E'\n  top questions: got %s rows, want 1 (the repeated Ikeja question)', cnt); end if;

  -- ---- data bounds ---------------------------------------------------------------------------------------
  r := ask_data_bounds(ba);
  if (r->>'first_message_at')::timestamptz <> '2026-10-20 10:00:00+00' then failures := failures || format(E'\n  data bounds: %s', r); end if;

  -- ---- isolation: owner A passes business B's id --------------------------------------------------------
  select count(*) into cnt from ask_message_volume(bb, from_ts, to_ts, 'Africa/Lagos', 'hour_of_day', 'both');
  if cnt > 0 then failures := failures || format(E'\n  LEAK: owner A read %s volume bucket(s) of business B', cnt); end if;
  r := ask_topic_mentions(bb, from_ts, to_ts, array['refund']);
  if (r->>'messages')::int > 0 then failures := failures || format(E'\n  LEAK: owner A saw B''s messages through topic search: %s', r); end if;
  r := ask_conversation_stats(bb, from_ts, to_ts);
  if (r->>'started')::int > 0 then failures := failures || format(E'\n  LEAK: owner A saw B''s conversations: %s', r); end if;
  r := ask_orders_summary(bb, from_ts, to_ts);
  if (r->>'orders')::int > 0 or (r->>'revenue')::numeric > 0 then failures := failures || format(E'\n  LEAK: owner A saw B''s orders: %s', r); end if;
  r := ask_data_bounds(bb);
  if r->>'first_message_at' is not null then failures := failures || format(E'\n  LEAK: owner A saw B''s data bounds: %s', r); end if;
  select count(*) into cnt from ask_top_questions(bb, from_ts, to_ts, 5);
  if cnt > 0 then failures := failures || E'\n  LEAK: owner A saw B''s top questions'; end if;
  r := ask_reply_quality(bb, from_ts, to_ts);
  if (r->>'customer_thumbs_down')::int > 0 or (r->>'customer_thumbs_up')::int > 0 then failures := failures || E'\n  LEAK: owner A saw B''s reply quality'; end if;

  perform pg_temp.as_postgres();

  -- ---- anon cannot call them at all --------------------------------------------------------------------
  perform pg_temp.as_user(null);
  begin
    perform ask_data_bounds(ba);
    failures := failures || E'\n  anon was allowed to run ask_data_bounds';
  exception when insufficient_privilege then null; end;
  perform pg_temp.as_postgres();

  if failures <> '' then
    raise exception E'ASK YOUR DATA TEST FAILED:%', failures;
  end if;
  raise notice 'ask your data: ok';
end $$;

rollback;

do $$ begin raise notice 'ASK YOUR DATA CHECKS PASSED'; end $$;
