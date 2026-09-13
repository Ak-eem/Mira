create or replace function get_ai_response_aggregate(
  p_business_id uuid default null,
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns table (
  total_count bigint,
  successful_count bigint,
  failed_count bigint,
  fallback_count bigint,
  groq_count bigint,
  gemini_count bigint,
  latency_sum bigint,
  latency_count bigint,
  input_tokens_sum bigint,
  output_tokens_sum bigint,
  token_count bigint
)
language sql
security invoker
set search_path = public
as $$
  select
    count(*)::bigint,
    count(*) filter (where success)::bigint,
    count(*) filter (where not success)::bigint,
    count(*) filter (where fallback_from is not null)::bigint,
    count(*) filter (where provider = 'groq' and success)::bigint,
    count(*) filter (where provider = 'gemini' and success)::bigint,
    coalesce(sum(latency_ms) filter (where success), 0)::bigint,
    count(*) filter (where success and latency_ms is not null)::bigint,
    sum(input_tokens)::bigint,
    sum(output_tokens)::bigint,
    count(*) filter (where input_tokens is not null or output_tokens is not null)::bigint
  from ai_response_telemetry
  where (p_business_id is null or business_id = p_business_id)
    and (p_from is null or created_at >= p_from)
    and (p_to is null or created_at <= p_to);
$$;