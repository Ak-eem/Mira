-- Fast, ranked product search for catalogues too big to fit in the AI's prompt (a tech store can
-- have thousands of items). Used by the chat to find what a customer is asking about, and by order
-- taking to match what they want to buy. Additive only: an extension, one index, one function.
--
-- Matching is by words and by spelling closeness (trigrams), so "iphne 15 pro" still finds
-- "Apple iPhone 15 Pro 256GB". Runs as the caller (SECURITY INVOKER), so row-level security
-- decides what is visible exactly as for a normal products query.

create extension if not exists pg_trgm with schema extensions;

create index if not exists products_search_trgm_idx
  on products using gin ((lower(name || ' ' || coalesce(description, ''))) extensions.gin_trgm_ops);

create or replace function public.search_products(p_business_id uuid, p_query text, p_limit integer default 12)
returns setof products
language sql
stable
set search_path = public, extensions
as $$
  with q as (
    select
      left(lower(trim(coalesce(p_query, ''))), 200) as t,
      array(
        select w
          from regexp_split_to_table(lower(regexp_replace(left(coalesce(p_query, ''), 200), '[^[:alnum:][:space:]]', ' ', 'g')), '\s+') as w
         where length(w) >= 2
         limit 8
      ) as words
  )
  select p.*
    from products p, q
   where p.business_id = p_business_id
     and q.t <> ''
     and (
       (cardinality(q.words) > 0 and lower(p.name || ' ' || coalesce(p.description, '')) ~ ('(' || array_to_string(q.words, '|') || ')'))
       or lower(p.name) % q.t
     )
   order by
     (
       similarity(lower(p.name), q.t) * 2
       + word_similarity(q.t, lower(p.name || ' ' || coalesce(p.description, '')))
       + (select count(*) from unnest(q.words) as w where lower(p.name) like '%' || w || '%')::real * 0.5
     ) desc,
     p.name
   limit least(greatest(coalesce(p_limit, 12), 1), 30);
$$;

grant execute on function public.search_products(uuid, text, integer) to authenticated, service_role;
