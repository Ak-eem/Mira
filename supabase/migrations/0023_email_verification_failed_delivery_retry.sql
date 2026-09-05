-- Failed provider deliveries must not consume the per-email quota.
-- Delete the undelivered reservation and return all aggregate counters so the
-- caller can retry immediately. This is additive and does not rewrite 0022.
create or replace function public.release_email_verification(
  p_code_id uuid, p_email text, p_ip inet default null, p_flow_token_hash text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_code public.email_verification_codes%rowtype;
  v_key text;
begin
  perform pg_advisory_xact_lock(hashtextextended('email_verification_rate_limits', 0));
  select * into v_code
  from public.email_verification_codes
  where id = p_code_id
    and email = lower(trim(p_email))
    and consumed_at is null
  for update;
  if v_code.id is null then return; end if;
  if p_flow_token_hash is not null and v_code.flow_token_hash is distinct from p_flow_token_hash then return; end if;

  delete from public.email_verification_codes where id = p_code_id;

  foreach v_key in array array['global', 'provider:resend'] || case when p_ip is null then array[]::text[] else array['ip:' || host(p_ip)] end loop
    update public.email_verification_rate_limits
    set request_count = greatest(0, request_count - 1)
    where bucket_key = v_key
      and window_started_at > now() - interval '1 hour';
  end loop;
end;
$$;

revoke all on function public.release_email_verification(uuid, text, inet, text) from public, anon, authenticated;
grant execute on function public.release_email_verification(uuid, text, inet, text) to service_role;
