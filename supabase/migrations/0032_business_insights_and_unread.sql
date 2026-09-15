-- Business-scoped insights that were missing from Business Analytics --
-- both follow the same security-invoker, RLS-relies-on-caller pattern as
-- get_ai_response_aggregate (migration 0031), rather than security
-- definer: the caller's own RLS on messages/conversations already scopes
-- these correctly, so there's no need for elevated privileges here.

-- Aggregates messages.context_snapshot->'productImages' (see
-- lib/chat/matchProductImages.ts for where that gets set) across a
-- business's assistant replies -- this is what customers actually got
-- shown, not a guess at what they asked about.
create or replace function get_popular_products(
  p_business_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_limit int default 5
)
returns table (product_name text, mention_count bigint)
language sql
security invoker
set search_path = public
as $$
  select
    (img->>'name') as product_name,
    count(*)::bigint as mention_count
  from messages m,
    lateral jsonb_array_elements(coalesce(m.context_snapshot->'productImages', '[]'::jsonb)) as img
  where m.business_id = p_business_id
    and m.role = 'assistant'
    and m.created_at >= p_from
    and m.created_at <= p_to
    and img->>'name' is not null
  group by img->>'name'
  order by mention_count desc, product_name asc
  limit p_limit;
$$;

-- Finds the customer question immediately preceding each fallback reply
-- (the standard "I don't have that information..." sentence -- see
-- FALLBACK_TEMPLATE in lib/ai/buildPrompt.ts and isFallbackReply()).
-- Deliberately a recency-ordered list, not a frequency count: grouping
-- differently-worded questions that mean the same thing needs real NLP,
-- which this doesn't have, so it doesn't pretend to.
-- NOTE: the LIKE pattern below is coupled to FALLBACK_TEMPLATE's exact
-- wording, same as isFallbackReply() is -- if that template ever
-- changes, this pattern needs updating too.
create or replace function get_unanswered_questions(
  p_business_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_limit int default 5
)
returns table (question text, asked_at timestamptz)
language sql
security invoker
set search_path = public
as $$
  with ordered as (
    select
      role,
      content,
      created_at,
      lag(content) over (partition by conversation_id order by created_at, id) as prev_content,
      lag(role) over (partition by conversation_id order by created_at, id) as prev_role
    from messages
    where business_id = p_business_id
      and created_at >= p_from
      and created_at <= p_to
  )
  select prev_content as question, created_at as asked_at
  from ordered
  where role = 'assistant'
    and prev_role = 'customer'
    and prev_content is not null
    and content like 'I don''t have that information for % yet -- I''d recommend contacting them directly to confirm.'
  order by created_at desc
  limit p_limit;
$$;

-- Real "unread" tracking for the conversation inbox -- previously no
-- read-state existed anywhere, so an "Unread" filter would have had
-- nothing behind it. Deliberately one shared timestamp per conversation
-- (last viewed by ANY staff member), not per-individual-admin -- matches
-- how a small shared inbox actually gets used, and avoids a second
-- join table for a feature this size.
alter table conversations
  add column if not exists last_viewed_at timestamptz;

-- Generated (not just computed client-side) so it can be filtered
-- directly via a normal .eq() -- PostgREST can't compare two columns
-- against each other in a filter, only a column against a supplied
-- value, so a plain "last_message_at > last_viewed_at" filter isn't
-- expressible without this.
alter table conversations
  add column if not exists is_unread boolean
  generated always as (last_message_at > coalesce(last_viewed_at, 'epoch'::timestamptz)) stored;
