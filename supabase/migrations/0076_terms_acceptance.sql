-- Proof that a person agreed, before their business was created, that they own it (or may act for it) and own or
-- may manage every website, WhatsApp number and email address they connect to Mira, and that they accept the Terms
-- of Service and Privacy Policy.
--
-- This migration is ADDITIVE and safe to apply before the new signup screens are deployed: nothing existing changes.
-- Enforcement (provision_new_business refusing to create a business without a record) is migration 0077, which must
-- only be applied AFTER the new site is live, or signups on the old site would start failing.
--
-- What is stored per acceptance: the account, the version, the exact words agreed to (copied from this file, never
-- from the browser), when, which screen, and (best effort, from the request) the IP address and browser. Rows are
-- written only by record_terms_acceptance() and are not readable or editable by any client.
--
-- When the Terms or the wording change: add the new version to terms_statement() and current_terms_version() in a NEW
-- migration (keep every older version so old records stay explainable) and bump TERMS_VERSION in lib/legal.ts.
-- Safe to re-run.

create table if not exists public.terms_acceptances (
  id uuid primary key default gen_random_uuid(),
  -- set null, not cascade: deleting an account must not erase the evidence of what was agreed to.
  user_id uuid references auth.users(id) on delete set null,
  business_id uuid references public.businesses(id) on delete set null,
  terms_version text not null,
  statement text not null,
  source text,
  ip_address text,
  user_agent text,
  accepted_at timestamptz not null default now()
);

-- One acceptance per person per version.
create unique index if not exists terms_acceptances_user_version_key
  on public.terms_acceptances (user_id, terms_version)
  where user_id is not null;
create index if not exists terms_acceptances_business_idx on public.terms_acceptances (business_id);

alter table public.terms_acceptances enable row level security;
revoke all on table public.terms_acceptances from anon, authenticated;

-- The words for each version. Must match AGREEMENT_FULL_TEXT in lib/legal.ts (a test enforces it).
create or replace function public.terms_statement(p_version text)
returns text
language sql
immutable
set search_path = public
as $$
  select case p_version
    when '2026-11-08' then 'I confirm that I own this business, or I am legally authorised to act for it, and that I own, or have permission to manage, every website, WhatsApp number and email address I connect to Mira. I agree to the Terms of Service and Privacy Policy.'
  end;
$$;

-- The version a NEW signup has to accept.
create or replace function public.current_terms_version()
returns text
language sql
immutable
set search_path = public
as $$
  select '2026-11-08'::text;
$$;

-- Called by the signed-in person right after their account exists. They can only record for themselves, the words
-- come from terms_statement() (not the caller), and calling it twice for the same version is harmless.
create or replace function public.record_terms_acceptance(p_terms_version text, p_source text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_statement text := public.terms_statement(p_terms_version);
  v_headers jsonb := '{}'::jsonb;
  v_ip text;
  v_agent text;
begin
  if v_user is null then
    raise exception using errcode = 'P0001', message = 'NOT_SIGNED_IN';
  end if;
  if v_statement is null then
    raise exception using errcode = 'P0001', message = 'UNKNOWN_TERMS_VERSION';
  end if;

  -- Best effort: PostgREST exposes the request headers. A missing or odd header must never block an acceptance.
  begin
    v_headers := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  exception when others then
    v_headers := '{}'::jsonb;
  end;
  v_ip := left(nullif(btrim(coalesce(v_headers ->> 'cf-connecting-ip', split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1))), ''), 64);
  v_agent := left(v_headers ->> 'user-agent', 300);

  insert into public.terms_acceptances (user_id, terms_version, statement, source, ip_address, user_agent)
  values (v_user, p_terms_version, v_statement, left(p_source, 40), v_ip, v_agent)
  on conflict (user_id, terms_version) where user_id is not null do nothing;
end;
$$;

revoke all on function public.record_terms_acceptance(text, text) from public, anon;
grant execute on function public.record_terms_acceptance(text, text) to authenticated, service_role;
revoke all on function public.terms_statement(text) from public, anon;
grant execute on function public.terms_statement(text) to authenticated, service_role;
revoke all on function public.current_terms_version() from public, anon;
grant execute on function public.current_terms_version() to authenticated, service_role;
