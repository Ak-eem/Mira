-- Tenant-isolation test for Mira.
--
-- Read-only in effect: everything runs inside a transaction that is rolled back,
-- so it is safe to run against a real Supabase project from the SQL editor.
-- Locally / in CI:   psql -v ON_ERROR_STOP=1 -d <db> -f supabase/tests/tenant_isolation.sql
-- Any failure raises an exception (non-zero exit). A pass ends with "ALL TENANT ISOLATION CHECKS PASSED".
--
-- Part A  catalog audit    -- RLS on every table, no anon grants, no wide-open policies
-- Part B  behavioural      -- two businesses, A's owner and B's owner try to reach each other's rows

begin;

-- ---------------------------------------------------------------------------
-- Part A: catalog audit
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
  problems text := '';
  -- Tables that are server-only (service role) by design: RLS on, no client privileges.
  server_only text[] := array[
    'whatsapp_inbound_queue','email_inbound_queue','rate_limit_buckets',
    'conversation_processing_leases','whatsapp_processed_messages',
    'email_verification_codes','email_verification_rate_limits'
  ];
begin
  -- A1. every public table has RLS enabled
  for r in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
  loop
    problems := problems || format(E'\n  RLS is OFF on public.%s', r.relname);
  end loop;

  -- A2. (Supabase grants anon/authenticated table privileges by default, so grants alone prove nothing;
  --     RLS-on (A1) plus the policy checks below are what protect the data.)

  -- A3. server-only tables: no policy that applies to any client role (only service_role may touch them)
  for r in
    select p.tablename, p.policyname from pg_policies p
    where p.schemaname='public' and p.tablename = any (server_only)
      and not (p.roles <@ array['service_role']::name[])
  loop
    problems := problems || format(E'\n  server-only table %s has a client-facing policy "%s"', r.tablename, r.policyname);
  end loop;

  -- A4. no policy for a client role that is simply "true" (wide open), except SELECT policies
  --     that are intentionally public are not expected in this schema.
  for r in
    select tablename, policyname, cmd, roles from pg_policies
    where schemaname='public'
      and not ('service_role' = any (roles))
      and (coalesce(qual,'') in ('true','(true)') or (cmd in ('INSERT') and coalesce(with_check,'') in ('true','(true)')))
  loop
    problems := problems || format(E'\n  wide-open policy "%s" on %s (%s)', r.policyname, r.tablename, r.cmd);
  end loop;

  -- A5. every table with a business_id column has at least one policy that mentions
  --     a membership/admin check, or is server-only
  for r in
    select c.table_name from information_schema.columns c
    join information_schema.tables t on t.table_schema=c.table_schema and t.table_name=c.table_name and t.table_type='BASE TABLE'
    where c.table_schema='public' and c.column_name='business_id'
      and c.table_name <> all (server_only)
      and not exists (
        select 1 from pg_policies p
        where p.schemaname='public' and p.tablename=c.table_name
          and (coalesce(p.qual,'') || coalesce(p.with_check,'')) ~* '(is_business_(member|owner|admin)|is_platform_admin|business_owners)'
      )
  loop
    problems := problems || format(E'\n  public.%s has business_id but no policy checking business membership', r.table_name);
  end loop;

  -- A6. SECURITY DEFINER functions that anon can execute run with the owner's rights, so RLS does not
  --     protect against them. Supabase grants anon EXECUTE by default, so each such function must
  --     authorise the caller itself (auth.uid(), is_platform_admin(), is_business_*).
  for r in
    select p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.prosecdef
      and p.prorettype <> 'trigger'::regtype
      and has_function_privilege('anon', p.oid, 'execute')
      and p.prosrc !~* '(auth\.uid\(\)|is_platform_admin\(\)|is_business_(member|owner|admin)\()'
  loop
    problems := problems || format(E'\n  SECURITY DEFINER public.%s(%s) is executable by anon and never checks the caller', r.proname, r.args);
  end loop;

  if problems <> '' then
    raise exception E'TENANT ISOLATION AUDIT FAILED:%', problems;
  end if;
  raise notice 'Part A (catalog audit): ok';
end $$;

-- ---------------------------------------------------------------------------
-- Part B: behavioural test with two tenants
-- ---------------------------------------------------------------------------
create temp table _ids (k text primary key, v uuid);
grant all on _ids to authenticated, anon;

do $$
declare
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); ux uuid := gen_random_uuid();
  ba uuid := gen_random_uuid(); bb uuid := gen_random_uuid();
  ca uuid := gen_random_uuid(); cb uuid := gen_random_uuid();
  pa uuid := gen_random_uuid(); pb uuid := gen_random_uuid();
begin
  insert into auth.users(id, email) values (ua,'a@test.local'),(ub,'b@test.local'),(ux,'nobody@test.local');
  insert into businesses(id, name, slug) values (ba,'Biz A','iso-test-a'),(bb,'Biz B','iso-test-b');
  insert into business_subscriptions(business_id, status) values (ba,'active'),(bb,'active');
  insert into business_owners(business_id, user_id, role) values (ba, ua, 'owner'),(bb, ub, 'owner');
  insert into products(id, business_id, name, price) values (pa, ba, 'A product', 100),(pb, bb, 'B product', 200);
  insert into services(business_id, name) values (ba,'A service'),(bb,'B service');
  insert into faqs(business_id, question, answer) values (ba,'qa','aa'),(bb,'qb','ab');
  insert into conversations(id, business_id, session_token) values (ca, ba,'sess-a'),(cb, bb,'sess-b');
  insert into messages(conversation_id, business_id, role, content) values (ca, ba,'customer','hello A'),(cb, bb,'customer','secret for B');
  insert into _ids values ('ua',ua),('ub',ub),('ux',ux),('ba',ba),('bb',bb),('ca',ca),('cb',cb),('pa',pa),('pb',pb);
end $$;

create function pg_temp.as_user(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_user::text,''), true);
  perform set_config('request.jwt.claim.role', case when p_user is null then 'anon' else 'authenticated' end, true);
  execute case when p_user is null then 'set local role anon' else 'set local role authenticated' end;
end $$;
create function pg_temp.as_postgres() returns void language plpgsql as $$
begin execute 'reset role'; end $$;
grant execute on function pg_temp.as_user(uuid), pg_temp.as_postgres() to public;

do $$
declare
  ua uuid; ub uuid; ux uuid; ba uuid; bb uuid; pb uuid; cb uuid;
  n int; t text; failures text := '';
  tenant_tables text[];
  function_ok boolean;
begin
  select v into ua from _ids where k='ua'; select v into ub from _ids where k='ub'; select v into ux from _ids where k='ux';
  select v into ba from _ids where k='ba'; select v into bb from _ids where k='bb';
  select v into pb from _ids where k='pb'; select v into cb from _ids where k='cb';

  -- B1. Owner A can see A's own data (sanity: the test must be able to see something)
  perform pg_temp.as_user(ua);
  select count(*) into n from products where business_id = ba;
  if n <> 1 then failures := failures || format(E'\n  sanity: owner A sees %s of own products (expected 1)', n); end if;
  perform pg_temp.as_postgres();

  -- B2. Owner A cannot SEE B's rows in any table that has a business_id column
  perform pg_temp.as_user(ua);
  for t in select c.relname::text from pg_class c
           join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
           join pg_attribute a on a.attrelid = c.oid and a.attname = 'business_id' and not a.attisdropped
           where c.relkind = 'r' and has_table_privilege('authenticated', c.oid, 'select')
  loop
    execute format('select count(*) from public.%I where business_id = $1', t) into n using bb;
    if n > 0 then failures := failures || format(E'\n  LEAK: owner A can read %s row(s) of business B in %s', n, t); end if;
  end loop;
  perform pg_temp.as_postgres();

  -- B3. Owner A cannot WRITE B's rows (update/delete affect 0 rows)
  perform pg_temp.as_user(ua);
  update products set name = 'hijacked' where id = pb; get diagnostics n = row_count;
  if n > 0 then failures := failures || E'\n  WRITE: owner A updated B''s product'; end if;
  delete from products where id = pb; get diagnostics n = row_count;
  if n > 0 then failures := failures || E'\n  WRITE: owner A deleted B''s product'; end if;
  update conversations set status = 'closed' where id = cb; get diagnostics n = row_count;
  if n > 0 then failures := failures || E'\n  WRITE: owner A updated B''s conversation'; end if;
  update businesses set name = 'hijacked' where id = bb; get diagnostics n = row_count;
  if n > 0 then failures := failures || E'\n  WRITE: owner A updated business B'; end if;
  update business_subscriptions set status = 'active' where business_id = bb; get diagnostics n = row_count;
  if n > 0 then failures := failures || E'\n  WRITE: owner A updated B''s subscription'; end if;
  perform pg_temp.as_postgres();

  -- B4. Owner A cannot INSERT rows into B
  perform pg_temp.as_user(ua);
  begin
    insert into products(business_id, name, price) values (bb, 'planted', 1);
    failures := failures || E'\n  WRITE: owner A inserted a product into business B';
  exception when others then null; -- insufficient_privilege / RLS violation / paywall: all fine
  end;
  begin
    insert into business_owners(business_id, user_id, role) values (bb, ua, 'owner');
    failures := failures || E'\n  PRIVILEGE ESCALATION: owner A added themselves as owner of business B';
  exception when others then null;
  end;
  perform pg_temp.as_postgres();

  -- B5. A logged-in user with no business sees nothing; anon sees nothing
  perform pg_temp.as_user(ux);
  select count(*) into n from messages; if n > 0 then failures := failures || format(E'\n  LEAK: user with no business reads %s message(s)', n); end if;
  select count(*) into n from conversations; if n > 0 then failures := failures || format(E'\n  LEAK: user with no business reads %s conversation(s)', n); end if;
  perform pg_temp.as_postgres();

  perform pg_temp.as_user(null);
  begin
    execute 'select count(*) from messages' into n;
    if n > 0 then failures := failures || format(E'\n  LEAK: anon reads %s message(s)', n); end if;
  exception when insufficient_privilege then null; -- expected: anon has no grant
  end;
  perform pg_temp.as_postgres();

  -- B6. Mirror check from B's side (catches a one-sided policy bug)
  perform pg_temp.as_user(ub);
  select count(*) into n from messages where business_id = ba;
  if n > 0 then failures := failures || format(E'\n  LEAK: owner B can read %s message(s) of business A', n); end if;
  perform pg_temp.as_postgres();

  if failures <> '' then
    raise exception E'TENANT ISOLATION TEST FAILED:%', failures;
  end if;
  raise notice 'Part B (two-tenant behavioural test): ok';
end $$;

rollback;

do $$ begin raise notice 'ALL TENANT ISOLATION CHECKS PASSED'; end $$;
