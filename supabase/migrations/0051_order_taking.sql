-- Phase 4: Mira takes orders end-to-end.
--
-- 1. orders gets a real 'confirmed' status between 'placed' and 'shipped'.
--    'placed' = the customer committed; 'confirmed' = the business accepted.
--    Existing manually-logged 'placed' orders keep their meaning.
-- 2. orders records where it came from (manual portal entry vs the AI), when
--    it was confirmed, and who marked it delivered.
-- 3. conversations.handoff_reason lets the ONE existing needs_human queue
--    distinguish "customer wants a human" from "an order awaits confirmation"
--    -- no second parallel queue.
-- 4. businesses.ai_order_taking is a per-business opt-in, off by default.
-- 5. place_order_atomic() creates the order, its items, the handoff flag and
--    the assistant's reply in ONE transaction. Prices and names are read from
--    the products table inside the function, never taken from the caller.

-- 1. status check (the original constraint was created inline, so find it by
--    definition instead of assuming its generated name).
do $$
declare
  c text;
begin
  for c in
    select conname
      from pg_constraint
     where conrelid = 'public.orders'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) like '%status%'
  loop
    execute format('alter table public.orders drop constraint %I', c);
  end loop;
end $$;

alter table orders
  add constraint orders_status_check
  check (status in ('cart', 'placed', 'confirmed', 'shipped', 'delivered', 'cancelled'));

-- 2. provenance + audit columns
alter table orders
  add column if not exists source text not null default 'manual'
    check (source in ('manual', 'ai')),
  add column if not exists confirmed_at timestamptz,
  add column if not exists delivered_by text
    check (delivered_by in ('customer', 'staff')),
  add column if not exists note text,
  add column if not exists inbound_key text;

-- Retry-safety for AI-created orders that arrive with a provider message id
-- (WhatsApp / email). Partial: manual orders and web chat have no key.
create unique index if not exists idx_orders_business_inbound_key
  on orders (business_id, inbound_key)
  where inbound_key is not null;

-- Powers "orders awaiting confirmation" and "orders the customer can mark delivered".
create index if not exists idx_orders_conversation_status
  on orders (conversation_id, status)
  where conversation_id is not null;

-- 3. handoff reason on the existing queue. null is treated as 'support'.
alter table conversations
  add column if not exists handoff_reason text
    check (handoff_reason in ('support', 'order'));

-- 4. per-business opt-in
alter table businesses
  add column if not exists ai_order_taking boolean not null default false;

-- 5. atomic order creation
--
-- p_items: jsonb array of {"product_id": uuid, "quantity": int}
-- Returns the order id, the recorded assistant message id, and whether this
-- call replayed an earlier one (same inbound key) rather than creating anything.
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

  insert into orders (business_id, conversation_id, customer_identifier, status, source, note, inbound_key, total)
  values (p_business_id, p_conversation_id, p_customer_identifier, 'placed', 'ai', p_note, p_inbound_key, 0)
  returning id into v_order_id;

  -- Names and prices come from products, scoped to this business. An id from
  -- another tenant, or an unavailable product, simply doesn't insert and the
  -- count check below aborts the whole transaction.
  insert into order_items (order_id, product_id, name, quantity, unit_price)
  select v_order_id, p.id, p.name, x.quantity, p.price
    from jsonb_to_recordset(p_items) as x(product_id uuid, quantity integer)
    join products p
      on p.id = x.product_id
     and p.business_id = p_business_id
     and p.is_available
     and (p.stock_quantity is null or p.stock_quantity >= x.quantity)
   where x.quantity between 1 and 10000;
  get diagnostics v_inserted = row_count;

  if v_inserted <> v_expected then
    raise exception 'place_order_atomic: % of % items could not be ordered', v_expected - v_inserted, v_expected;
  end if;

  select coalesce(sum(oi.quantity * oi.unit_price), 0) into v_total
    from order_items oi where oi.order_id = v_order_id;
  update orders set total = v_total where id = v_order_id;

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
