-- Tests for the ownership agreement (migrations 0075 and 0076). Rolled back at the end; a failure raises.
--  1. recording: the words come from the database, one record per person per version, who/when/where are kept
--  2. the table is invisible and untouchable to every client (evidence cannot be edited or deleted by its owner)
--  3. enforcement: no agreement, no business; the agreement is tied to the business it was given for
--  4. nobody can record on someone else's behalf, and anon cannot record at all
-- Every scenario uses its own person, so a failure in one is reported cleanly instead of crashing a later one.

begin;

create temp table _ids (k text primary key, v uuid);
grant all on _ids to authenticated, anon;

do $$
declare
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); uadmin uuid := gen_random_uuid(); ucli uuid := gen_random_uuid();
  uold uuid := gen_random_uuid(); utarget uuid := gen_random_uuid();
begin
  insert into auth.users(id, email) values
    (ua, 'a@terms.local'), (ub, 'b@terms.local'), (uadmin, 'admin@terms.local'),
    (ucli, 'client@terms.local'), (uold, 'old@terms.local'), (utarget, 'target@terms.local');
  insert into platform_admins(id, email) values (uadmin, 'admin@terms.local');
  insert into _ids values ('ua', ua), ('ub', ub), ('uadmin', uadmin), ('ucli', ucli), ('uold', uold), ('utarget', utarget);
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
  ua uuid; ub uuid; uadmin uuid; ucli uuid; uold uuid; utarget uuid;
  failures text := '';
  v text := public.current_terms_version();
  r record; n int; biz uuid; msg text;
begin
  select v1.v into ua from _ids v1 where k = 'ua';
  select v1.v into ub from _ids v1 where k = 'ub';
  select v1.v into uadmin from _ids v1 where k = 'uadmin';
  select v1.v into ucli from _ids v1 where k = 'ucli';
  select v1.v into uold from _ids v1 where k = 'uold';
  select v1.v into utarget from _ids v1 where k = 'utarget';

  -- ---------- 1. recording ----------
  perform set_config('request.headers', '{"x-forwarded-for":"203.0.113.9, 10.0.0.1","user-agent":"TestBrowser/1.0"}', true);
  perform pg_temp.as_user(ua);
  perform record_terms_acceptance(v, 'portal_signup');
  perform record_terms_acceptance(v, 'business_name');   -- harmless repeat
  perform pg_temp.as_postgres();

  select count(*) into n from terms_acceptances where user_id = ua;
  if n <> 1 then failures := failures || format(E'\n  expected exactly one record for the person after two calls, got %s', n); end if;
  select * into r from terms_acceptances where user_id = ua;
  if r.terms_version is distinct from v then failures := failures || E'\n  wrong version stored'; end if;
  if r.statement is distinct from terms_statement(v) then failures := failures || E'\n  the stored words are not the database''s words for that version'; end if;
  if r.statement !~ 'I own this business' or r.statement !~ 'every website, WhatsApp number and email address' then failures := failures || E'\n  stored words do not contain the ownership statement'; end if;
  if r.source is distinct from 'portal_signup' then failures := failures || format(E'\n  the FIRST source should be kept, got %s', r.source); end if;
  if r.ip_address is distinct from '203.0.113.9' then failures := failures || format(E'\n  ip should be the first forwarded address, got %s', r.ip_address); end if;
  if r.user_agent is distinct from 'TestBrowser/1.0' then failures := failures || E'\n  user agent not stored'; end if;
  if r.accepted_at is null or r.accepted_at > now() + interval '1 minute' then failures := failures || E'\n  accepted_at missing or in the future'; end if;
  if r.business_id is not null then failures := failures || E'\n  a fresh acceptance should not be tied to a business yet'; end if;

  -- a call with no usable headers still records (headers are best effort)
  perform set_config('request.headers', 'not json at all', true);
  perform pg_temp.as_user(ub);
  perform record_terms_acceptance(v, null);
  perform pg_temp.as_postgres();
  select ip_address into msg from terms_acceptances where user_id = ub;
  if not exists (select 1 from terms_acceptances where user_id = ub) then failures := failures || E'\n  odd headers must not block recording'; end if;
  if msg is not null then failures := failures || E'\n  no ip should be stored when there are no usable headers'; end if;
  perform set_config('request.headers', '', true);

  -- unknown version and signed-out callers are refused
  perform pg_temp.as_user(ua);
  begin perform record_terms_acceptance('1999-01-01', 'x'); failures := failures || E'\n  an unknown version was accepted'; exception when others then null; end;
  perform pg_temp.as_postgres();
  perform pg_temp.as_user(null);
  begin perform record_terms_acceptance(v, 'x'); failures := failures || E'\n  anon was allowed to record an acceptance'; exception when insufficient_privilege then null; end;
  perform pg_temp.as_postgres();

  -- ---------- 2. nobody can see or change the evidence ----------
  perform pg_temp.as_user(ua);
  begin perform 1 from terms_acceptances limit 1; failures := failures || E'\n  a signed-in user could READ terms_acceptances'; exception when insufficient_privilege then null; end;
  begin update terms_acceptances set statement = 'edited'; failures := failures || E'\n  a signed-in user could UPDATE terms_acceptances'; exception when insufficient_privilege then null; end;
  begin delete from terms_acceptances; failures := failures || E'\n  a signed-in user could DELETE from terms_acceptances'; exception when insufficient_privilege then null; end;
  begin insert into terms_acceptances(user_id, terms_version, statement) values (ua, 'x', 'forged'); failures := failures || E'\n  a signed-in user could INSERT into terms_acceptances directly'; exception when insufficient_privilege then null; end;
  perform pg_temp.as_postgres();

  -- ---------- 3. enforcement ----------
  perform pg_temp.as_user(ucli);
  begin
    perform provision_new_business('No Agreement Ltd', ucli);
    failures := failures || E'\n  a business was created without an agreement';
  exception when others then
    get stacked diagnostics msg = message_text;
    if msg <> 'TERMS_NOT_ACCEPTED' then failures := failures || format(E'\n  wrong error without an agreement: %s', msg); end if;
  end;
  perform pg_temp.as_postgres();
  if exists (select 1 from businesses where name = 'No Agreement Ltd') then failures := failures || E'\n  a business exists for a person who never agreed'; end if;

  -- someone else's acceptance does not count
  perform pg_temp.as_user(ucli);
  begin perform provision_new_business('Borrowed Agreement Ltd', ua); failures := failures || E'\n  provisioning for another person was allowed'; exception when others then null; end;
  perform pg_temp.as_postgres();

  -- with an agreement it works, and the agreement is tied to the business
  perform pg_temp.as_user(ua);
  biz := provision_new_business('With Agreement Ltd', ua);
  perform pg_temp.as_postgres();
  if biz is null or not exists (select 1 from businesses where id = biz) then failures := failures || E'\n  business not created after agreeing'; end if;
  if (select business_id from terms_acceptances where user_id = ua) is distinct from biz then failures := failures || E'\n  the agreement was not tied to the business it was given for'; end if;

  -- an agreement to an older version does not satisfy the current one
  insert into terms_acceptances(user_id, terms_version, statement) values (uold, '1999-01-01', 'old words');
  perform pg_temp.as_user(uold);
  begin perform provision_new_business('Old Version Ltd', uold); failures := failures || E'\n  an agreement to an old version let a business be created'; exception when others then null; end;
  perform pg_temp.as_postgres();

  -- a platform admin provisioning for someone else is not the owner agreeing: unchanged
  perform pg_temp.as_user(uadmin);
  biz := provision_new_business('Admin Made Ltd', utarget);
  perform pg_temp.as_postgres();
  if biz is null then failures := failures || E'\n  an admin could no longer provision a business for someone'; end if;

  if failures <> '' then
    raise exception E'TERMS ACCEPTANCE TEST FAILED:%', failures;
  end if;
  raise notice 'terms acceptance: ok';
end $$;

rollback;

do $$ begin raise notice 'TERMS ACCEPTANCE CHECKS PASSED'; end $$;
