-- Reserve stock when an AI order is placed, and give it back if the order is cancelled.
--
-- Before this, place_order_atomic() only READ stock_quantity (>= quantity) and never
-- decremented it, so two customers could each pass the check for the last unit before
-- either order was confirmed and both orders were accepted.
--
-- Rules (stock_quantity IS NULL still means "not tracked", see 0005_products.sql):
--   * Placement locks the ordered products (in id order, so concurrent orders cannot
--     deadlock), checks stock against the TOTAL asked per product, then decrements it,
--     all in the same transaction as the order insert. A concurrent second order waits
--     on the row lock and then fails the check.
--   * Untracked products (stock_quantity IS NULL) are never read for stock or changed.
--   * Cancelling an order that holds a reservation returns the stock, exactly once.
--     Done by a trigger on orders so it is atomic with the status change and cannot be
--     skipped by any code path that updates orders.status.
--   * A cancelled order whose stock was released can't be re-opened (its units may
--     already be sold). The customer places a new order instead.
--   * Manual portal orders and AI orders placed before this migration never reserved
--     stock, so they are never restocked (stock_reserved stays false).

alter table orders
  add column if not exists stock_reserved boolean not null default false,
  add column if not exists stock_released_at timestamptz;

create or replace function place_order_atomic(
  p_business_id uuid,
  p_conversation_id uuid,
  p_customer_identifier text,
  p_items jsonb,
  p_note text,
  p_inbound_key text,
  p_reply_content text,
  p_reply_snapshot jsonb,
  p_reply_inbound_key text
)
returns table (order_id uuid, message_id uuid, replayed boolean)
language plpgsql
set search_path = public
as $$
#variable_conflict use_column
declare
  v_order_id uuid;
  v_message_id uuid;
  v_expected integer;
  v_inserted integer;
  v_total numeric(12, 2);
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'place_order_atomic: no items';
  end if;

  -- Replay of an earlier attempt at the same inbound message.
  if p_inbound_key is not null then
    select o.id into v_order_id
      from orders o
     where o.business_id = p_business_id and o.inbound_key = p_inbound_key;
    if v_order_id is not null then
      select m.id into v_message_id
        from messages m
       where m.business_id = p_business_id
         and m.inbound_key = p_reply_inbound_key;
      return query select v_order_id, v_message_id, true;
      return;
    end if;
  end if;

  -- The conversation must belong to this business (tenant isolation).
  perform 1 from conversations c
   where c.id = p_conversation_id and c.business_id = p_business_id;
  if not found then
    raise exception 'place_order_atomic: conversation does not belong to business';
  end if;

  v_expected := jsonb_array_length(p_items);

  -- Serialise on the ordered products. Fixed (id) lock order so two orders for
  -- overlapping baskets can't deadlock. Everything below sees committed stock.
  perform 1
    from products p
   where p.business_id = p_business_id
     and p.id in (select r.product_id from jsonb_to_recordset(p_items) as r(product_id uuid, quantity integer))
   order by p.id
     for update;

  insert into orders (business_id, conversation_id, customer_identifier, status, source, note, inbound_key, total)
  values (p_business_id, p_conversation_id, p_customer_identifier, 'placed', 'ai', p_note, p_inbound_key, 0)
  returning id into v_order_id;

  -- Names and prices come from products, scoped to this business. An id from
  -- another tenant, an unavailable product, or a product without enough stock for
  -- the TOTAL asked of it (the same product can appear on two lines) simply doesn't
  -- insert and the count check below aborts the whole transaction.
  insert into order_items (order_id, product_id, name, quantity, unit_price)
  select v_order_id, p.id, p.name, x.quantity, p.price
    from jsonb_to_recordset(p_items) as x(product_id uuid, quantity integer)
    join products p
      on p.id = x.product_id
     and p.business_id = p_business_id
     and p.is_available
    join (
      select r.product_id, sum(r.quantity) as wanted
        from jsonb_to_recordset(p_items) as r(product_id uuid, quantity integer)
       group by r.product_id
    ) need on need.product_id = p.id
   where x.quantity between 1 and 10000
     and (p.stock_quantity is null or p.stock_quantity >= need.wanted);
  get diagnostics v_inserted = row_count;

  if v_inserted <> v_expected then
    raise exception 'place_order_atomic: % of % items could not be ordered', v_expected - v_inserted, v_expected;
  end if;

  -- Reserve. Rows are locked and checked above; tracked products only (NULL = untracked).
  -- products.stock_quantity >= 0 (0005) is the last line of defence against going negative.
  update products p
     set stock_quantity = p.stock_quantity - need.wanted,
         updated_at = now()
    from (
      select r.product_id, sum(r.quantity) as wanted
        from jsonb_to_recordset(p_items) as r(product_id uuid, quantity integer)
       group by r.product_id
    ) need
   where p.id = need.product_id
     and p.business_id = p_business_id
     and p.stock_quantity is not null;

  select coalesce(sum(oi.quantity * oi.unit_price), 0) into v_total
    from order_items oi where oi.order_id = v_order_id;
  update orders set total = v_total, stock_reserved = true where id = v_order_id;

  -- Reuse the existing handoff path: flags needs_human, writes the reply and
  -- bumps last_message_at atomically (idempotent on the reply key).
  select r.message_id into v_message_id
    from record_assistant_reply(
      p_conversation_id, p_business_id, p_reply_content, p_reply_snapshot,
      p_reply_inbound_key, true, null, null
    ) as r;

  update conversations
     set handoff_reason = 'order'
   where id = p_conversation_id
     and business_id = p_business_id
     and needs_human = true
     and handoff_reason is distinct from 'order';

  return query select v_order_id, v_message_id, false;
end;
$$;

revoke all on function place_order_atomic(uuid, uuid, text, jsonb, text, text, text, jsonb, text) from public, anon, authenticated;
grant execute on function place_order_atomic(uuid, uuid, text, jsonb, text, text, text, jsonb, text) to service_role;

-- Cancellation returns the reservation (once), and a released order stays cancelled.
-- SECURITY DEFINER: the portal updates orders with the staff member's RLS-bound
-- client, which must not need (or be given) write access to products for this.
create or replace function orders_release_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.stock_released_at is not null and new.status is distinct from 'cancelled' then
    raise exception 'This order was cancelled and its stock released. Place a new order instead.';
  end if;

  if new.status = 'cancelled' and old.status is distinct from 'cancelled' and old.stock_reserved then
    perform 1
      from products p
     where p.business_id = old.business_id
       and p.id in (select oi.product_id from order_items oi where oi.order_id = old.id and oi.product_id is not null)
     order by p.id
       for update;

    update products p
       set stock_quantity = p.stock_quantity + back.qty,
           updated_at = now()
      from (
        select oi.product_id, sum(oi.quantity) as qty
          from order_items oi
         where oi.order_id = old.id and oi.product_id is not null
         group by oi.product_id
      ) back
     where p.id = back.product_id
       and p.business_id = old.business_id
       and p.stock_quantity is not null;

    new.stock_reserved := false;
    new.stock_released_at := now();
  end if;

  return new;
end;
$$;

revoke all on function orders_release_stock() from public, anon, authenticated;

drop trigger if exists orders_release_stock_trg on orders;
create trigger orders_release_stock_trg
  before update of status on orders
  for each row
  execute function orders_release_stock();
