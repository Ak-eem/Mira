-- Keep the quoted recap price and order creation tied to the same transaction.
-- Recheck availability and stock at confirmation, but do not silently change a
-- price the customer already saw and accepted.
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
set search_path = public, pg_temp
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

  perform 1
    from conversations c
   where c.id = p_conversation_id and c.business_id = p_business_id;
  if not found then
    raise exception 'place_order_atomic: conversation does not belong to business';
  end if;

  v_expected := jsonb_array_length(p_items);

  perform 1
    from products p
   where p.business_id = p_business_id
     and p.id in (select r.product_id from jsonb_to_recordset(p_items) as r(product_id uuid, quantity integer, unit_price numeric))
   order by p.id
     for update;

  -- The unique partial-index conflict path also serializes simultaneous retries.
  insert into orders (business_id, conversation_id, customer_identifier, status, source, note, inbound_key, total)
  values (p_business_id, p_conversation_id, p_customer_identifier, 'placed', 'ai', p_note, p_inbound_key, 0)
  on conflict (business_id, inbound_key) where inbound_key is not null do nothing
  returning id into v_order_id;

  if v_order_id is null then
    select o.id into v_order_id
      from orders o
     where o.business_id = p_business_id and o.inbound_key = p_inbound_key;
    select m.id into v_message_id
      from messages m
     where m.business_id = p_business_id
       and m.inbound_key = p_reply_inbound_key;
    if v_order_id is null or v_message_id is null then
      raise exception 'place_order_atomic: conflicting retry has no completed order reply';
    end if;
    return query select v_order_id, v_message_id, true;
    return;
  end if;

  insert into order_items (order_id, product_id, name, quantity, unit_price)
  select v_order_id, p.id, p.name, x.quantity, coalesce(x.unit_price, p.price)
    from jsonb_to_recordset(p_items) as x(product_id uuid, quantity integer, unit_price numeric)
    join products p
      on p.id = x.product_id
     and p.business_id = p_business_id
     and p.is_available
    join (
      select r.product_id, sum(r.quantity) as wanted
        from jsonb_to_recordset(p_items) as r(product_id uuid, quantity integer, unit_price numeric)
       group by r.product_id
    ) need on need.product_id = p.id
   where x.quantity between 1 and 10000
     and (x.unit_price is null or x.unit_price between 0 and 1000000000)
     and (p.stock_quantity is null or p.stock_quantity >= need.wanted);
  get diagnostics v_inserted = row_count;

  if v_inserted <> v_expected then
    raise exception 'place_order_atomic: % of % items could not be ordered', v_expected - v_inserted, v_expected;
  end if;

  update products p
     set stock_quantity = p.stock_quantity - need.wanted,
         updated_at = now()
    from (
      select r.product_id, sum(r.quantity) as wanted
        from jsonb_to_recordset(p_items) as r(product_id uuid, quantity integer, unit_price numeric)
       group by r.product_id
    ) need
   where p.id = need.product_id
     and p.business_id = p_business_id
     and p.stock_quantity is not null;

  select coalesce(sum(oi.quantity * oi.unit_price), 0) into v_total
    from order_items oi where oi.order_id = v_order_id;
  update orders set total = v_total, stock_reserved = true where id = v_order_id;

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

-- A manual order and its line items must commit or roll back together. The
-- invoker's RLS policies remain in force for both inserts.
create or replace function create_manual_order_atomic(
  p_business_id uuid,
  p_conversation_id uuid,
  p_customer_identifier text,
  p_status text,
  p_items jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_order_id uuid;
  v_total numeric(12, 2);
begin
  if p_status is null or p_status not in ('cart', 'placed', 'confirmed', 'shipped', 'delivered', 'cancelled') then
    raise exception 'create_manual_order_atomic: invalid order status';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 100 then
    raise exception 'create_manual_order_atomic: invalid item count';
  end if;
  if exists (
    select 1
      from jsonb_to_recordset(p_items) as i(name text, quantity integer, unit_price numeric)
     where i.name is null or btrim(i.name) = '' or char_length(btrim(i.name)) > 200
        or i.quantity is null or i.quantity not between 1 and 10000
        or (i.unit_price is not null and i.unit_price not between 0 and 1000000000)
  ) then
    raise exception 'create_manual_order_atomic: invalid order item';
  end if;
  if p_customer_identifier is null or btrim(p_customer_identifier) = '' then
    raise exception 'create_manual_order_atomic: customer identifier is required';
  end if;
  if p_conversation_id is not null and not exists (
    select 1
      from conversations c
     where c.id = p_conversation_id and c.business_id = p_business_id
  ) then
    raise exception 'create_manual_order_atomic: conversation does not belong to business';
  end if;

  insert into orders (business_id, conversation_id, customer_identifier, status, source, total)
  values (p_business_id, p_conversation_id, btrim(p_customer_identifier), p_status, 'manual', 0)
  returning id into v_order_id;

  insert into order_items (order_id, name, quantity, unit_price)
  select v_order_id, btrim(i.name), i.quantity, i.unit_price
    from jsonb_to_recordset(p_items) as i(name text, quantity integer, unit_price numeric);

  select coalesce(sum(oi.quantity * oi.unit_price), 0) into v_total
    from order_items oi where oi.order_id = v_order_id;
  update orders set total = v_total where id = v_order_id;

  return v_order_id;
end;
$$;

revoke all on function create_manual_order_atomic(uuid, uuid, text, text, jsonb) from public, anon;
grant execute on function create_manual_order_atomic(uuid, uuid, text, text, jsonb) to authenticated;
