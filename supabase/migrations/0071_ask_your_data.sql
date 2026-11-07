-- "Ask your data" (Phase 6): read-only aggregate lookups the portal's data assistant is allowed to run.
--
-- Every function here is SECURITY INVOKER: it runs with the signed-in caller's own row-level security,
-- exactly like get_ai_response_aggregate (0031) and get_popular_products (0032). Passing another
-- business's id returns nothing, because the caller's policies hide that business's rows. None of these
-- functions writes anything, and none is granted to anon.
--
-- Time: every date range arrives as two UTC instants already resolved in the business's own timezone
-- (see lib/ask/range.ts), and hour / weekday / day bucketing happens HERE with AT TIME ZONE p_tz, so
-- "busiest hours" means the business's local clock, not the server's.
--
-- Aggregation is done in SQL on purpose: fetching rows and counting them in application code is
-- silently capped by the API's row limit on a busy business, which would make the answers wrong.
--
-- Safe to re-run.

-- Support the range scans below. Plain (non-concurrent) builds because migrations run in a transaction.
create index if not exists idx_messages_business_role_created on messages (business_id, role, created_at);
create index if not exists idx_conversations_business_started on conversations (business_id, started_at);
create index if not exists idx_orders_business_created on orders (business_id, created_at);

-- How far back this business's data goes, so an answer can say "you only have data since ..." instead of
-- presenting a short history as a full one.
create or replace function ask_data_bounds(p_business_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'first_message_at', min(created_at),
    'last_message_at', max(created_at)
  )
  from messages
  where business_id = p_business_id;
$$;

-- Message counts bucketed by the business's local hour of day (00-23), ISO weekday (1 = Monday ... 7 = Sunday)
-- or calendar day. Only buckets that have messages are returned; the caller fills in the zeros.
create or replace function ask_message_volume(
  p_business_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_tz text,
  p_group text,
  p_who text default 'customers'
)
returns table (bucket text, n bigint)
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  if p_group not in ('hour_of_day', 'weekday', 'day') then
    raise exception 'ask_message_volume: p_group must be hour_of_day, weekday or day';
  end if;
  if p_who not in ('customers', 'assistant', 'both') then
    raise exception 'ask_message_volume: p_who must be customers, assistant or both';
  end if;

  return query
  select
    case p_group
      when 'hour_of_day' then lpad((extract(hour from m.created_at at time zone p_tz))::int::text, 2, '0')
      when 'weekday' then (extract(isodow from m.created_at at time zone p_tz))::int::text
      else to_char(m.created_at at time zone p_tz, 'YYYY-MM-DD')
    end as bucket,
    count(*)::bigint as n
  from messages m
  where m.business_id = p_business_id
    and m.created_at >= p_from
    and m.created_at <= p_to
    and (p_who = 'both' or m.role = case p_who when 'customers' then 'customer' else 'assistant' end)
  group by 1
  order by 1;
end;
$$;

-- Conversations that STARTED in the range: how many, by channel, handed to a human, closed, rated, and how
-- many distinct chat sessions (a session is one browser visitor or one WhatsApp number, so one person who
-- comes back on a new device counts twice) and how many of those had chatted before the range began.
create or replace function ask_conversation_stats(
  p_business_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with c as (
    select id, session_token, channel, status, needs_human, customer_rating
    from conversations
    where business_id = p_business_id
      and started_at >= p_from
      and started_at <= p_to
  )
  select jsonb_build_object(
    'started', (select count(*) from c),
    'by_channel', coalesce((select jsonb_object_agg(channel, n) from (select channel, count(*) as n from c group by channel) x), '{}'::jsonb),
    'needed_a_human', (select count(*) from c where needs_human),
    'closed', (select count(*) from c where status = 'closed'),
    'rated', (select count(*) from c where customer_rating is not null),
    'average_rating', (select round(avg(customer_rating)::numeric, 2) from c where customer_rating is not null),
    'chat_sessions', (select count(distinct session_token) from c),
    'returning_sessions', (
      select count(distinct c.session_token) from c
      where exists (
        select 1 from conversations o
        where o.business_id = p_business_id
          and o.session_token = c.session_token
          and o.started_at < p_from
      )
    )
  );
$$;

-- Customer messages that mention any of the given words or phrases (case-insensitive substring match; the
-- caller passes variants such as refund / return / money back). LIKE wildcards in the terms are escaped.
create or replace function ask_topic_mentions(
  p_business_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_terms text[]
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  patterns text[];
  result jsonb;
begin
  select coalesce(array_agg('%' || replace(replace(replace(btrim(t), '\', '\\'), '%', '\%'), '_', '\_') || '%'), '{}')
    into patterns
  from unnest(p_terms) as t
  where length(btrim(t)) between 3 and 40;

  if coalesce(cardinality(patterns), 0) = 0 or cardinality(patterns) > 8 then
    raise exception 'ask_topic_mentions: give 1 to 8 terms of 3 to 40 characters';
  end if;

  with hits as (
    select m.conversation_id, m.created_at, m.content, c.session_token
    from messages m
    join conversations c on c.id = m.conversation_id
    where m.business_id = p_business_id
      and m.role = 'customer'
      and m.created_at >= p_from
      and m.created_at <= p_to
      and m.content ilike any (patterns)
  )
  select jsonb_build_object(
    'messages', (select count(*) from hits),
    'conversations', (select count(distinct conversation_id) from hits),
    'chat_sessions', (select count(distinct session_token) from hits),
    'examples', coalesce((
      select jsonb_agg(jsonb_build_object('at', e.created_at, 'text', left(e.content, 140)) order by e.created_at desc)
      from (select created_at, content from hits order by created_at desc limit 5) e
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

-- Questions customers sent with the SAME wording at least twice. Identical wording only: grouping questions
-- that merely mean the same thing needs language understanding this does not pretend to have.
create or replace function ask_top_questions(
  p_business_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_limit int default 5
)
returns table (question text, n bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select min(m.content) as question, count(*)::bigint as n
  from messages m
  where m.business_id = p_business_id
    and m.role = 'customer'
    and m.created_at >= p_from
    and m.created_at <= p_to
    and length(btrim(m.content)) >= 8
  group by lower(btrim(m.content))
  having count(*) >= 2
  order by count(*) desc, min(m.content) asc
  limit least(greatest(p_limit, 1), 10);
$$;

-- Orders created in the range (carts that were never placed are not orders and are left out).
create or replace function ask_orders_summary(
  p_business_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with o as (
    select status, total
    from orders
    where business_id = p_business_id
      and created_at >= p_from
      and created_at <= p_to
      and status <> 'cart'
  )
  select jsonb_build_object(
    'orders', (select count(*) from o),
    'by_status', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) as n from o group by status) x), '{}'::jsonb),
    'counted_for_revenue', (select count(*) from o where status in ('placed', 'shipped', 'delivered')),
    'revenue', coalesce((select sum(total) from o where status in ('placed', 'shipped', 'delivered')), 0),
    'cancelled', (select count(*) from o where status = 'cancelled')
  );
$$;

-- How the assistant's replies fared: the grounding check's verdicts and the customers' thumbs.
create or replace function ask_reply_quality(
  p_business_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'grounding_verdicts', coalesce((
      select jsonb_object_agg(verdict, n)
      from (
        select verdict, count(*) as n
        from message_assessments
        where business_id = p_business_id and created_at >= p_from and created_at <= p_to
        group by verdict
      ) g
    ), '{}'::jsonb),
    'customer_thumbs_up', (
      select count(*) from message_feedback f join messages m on m.id = f.message_id
      where m.business_id = p_business_id and f.source = 'customer' and f.rating = 'up'
        and f.created_at >= p_from and f.created_at <= p_to
    ),
    'customer_thumbs_down', (
      select count(*) from message_feedback f join messages m on m.id = f.message_id
      where m.business_id = p_business_id and f.source = 'customer' and f.rating = 'down'
        and f.created_at >= p_from and f.created_at <= p_to
    ),
    'thumbs_down_reasons', coalesce((
      select jsonb_object_agg(reason, n)
      from (
        select f.reason, count(*) as n
        from message_feedback f join messages m on m.id = f.message_id
        where m.business_id = p_business_id and f.source = 'customer' and f.rating = 'down'
          and f.reason is not null and f.created_at >= p_from and f.created_at <= p_to
        group by f.reason
      ) r
    ), '{}'::jsonb)
  );
$$;

-- Only signed-in users (under their own RLS) and the server may call these; never anon.
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'ask_data_bounds(uuid)',
    'ask_message_volume(uuid, timestamptz, timestamptz, text, text, text)',
    'ask_conversation_stats(uuid, timestamptz, timestamptz)',
    'ask_topic_mentions(uuid, timestamptz, timestamptz, text[])',
    'ask_top_questions(uuid, timestamptz, timestamptz, int)',
    'ask_orders_summary(uuid, timestamptz, timestamptz)',
    'ask_reply_quality(uuid, timestamptz, timestamptz)'
  ] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated, service_role', fn);
  end loop;
end $$;
