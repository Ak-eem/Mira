-- Per-business AI usage for the admin dashboard's "AI cost this month" card.
--
-- Sums successful AI replies by business and provider from ai_response_telemetry, so
-- the app can price the tokens in naira (see lib/admin/aiCost.ts). Aggregation happens
-- in the database because a busy month is many thousands of rows, and PostgREST would
-- otherwise return them a thousand at a time.
--
-- SECURITY INVOKER on purpose: the existing RLS policies on ai_response_telemetry still
-- apply, so a platform admin sees every business and a business owner could only ever
-- see their own rows. The client dashboard does not call this; it is admin-only in the UI.

create or replace function get_ai_usage_by_business(
  p_from timestamptz,
  p_to timestamptz default null
)
returns table (
  business_id uuid,
  provider text,
  calls bigint,
  input_tokens bigint,
  output_tokens bigint
)
language sql
security invoker
set search_path = public
as $$
  select
    business_id,
    provider,
    count(*)::bigint,
    coalesce(sum(input_tokens), 0)::bigint,
    coalesce(sum(output_tokens), 0)::bigint
  from ai_response_telemetry
  where success
    and created_at >= p_from
    and (p_to is null or created_at <= p_to)
  group by business_id, provider;
$$;
