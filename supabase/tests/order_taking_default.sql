-- New businesses record chat orders automatically (migration 0059); existing choices are respected.
-- Rolls back, safe anywhere.
begin;
do $$
declare fresh boolean; opted_out boolean;
begin
  insert into businesses(name, slug) values ('Default shop', 'default-order-taking-test');
  insert into businesses(name, slug, ai_order_taking) values ('Opted-out shop', 'opted-out-order-taking-test', false);
  select ai_order_taking into fresh from businesses where slug = 'default-order-taking-test';
  select ai_order_taking into opted_out from businesses where slug = 'opted-out-order-taking-test';
  if fresh is not true then raise exception 'a new business should have AI order-taking on by default (got %)', fresh; end if;
  if opted_out is not false then raise exception 'an explicit opt-out must be respected (got %)', opted_out; end if;
  raise notice 'order-taking default: ok';
end $$;
rollback;
