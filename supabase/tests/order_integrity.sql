-- Regression coverage for quoted prices, inbound retries, and atomic manual orders.
-- Rolls back all inserted data and test-only trigger objects.
begin;

create function public.order_integrity_reject_manual_item() returns trigger
language plpgsql
as $$
begin
  if new.name = 'force atomic failure' then
    raise exception 'forced item insert failure';
  end if;
  return new;
end;
$$;
create trigger order_integrity_force_item_failure
  before insert on order_items
  for each row execute function public.order_integrity_reject_manual_item();

do $$
declare
  v_business_id uuid;
  v_conversation_id uuid;
  v_product_id uuid;
  v_order_id uuid;
  v_replay_order_id uuid;
  v_message_id uuid;
  v_replay_message_id uuid;
  v_replayed boolean;
  v_unit_price numeric;
  v_total numeric;
  v_stock integer;
  v_count integer;
  v_failed boolean := false;
begin
  insert into businesses(name, slug)
  values ('Order integrity test', 'order-integrity-regression-test')
  returning id into v_business_id;

  insert into conversations(business_id, session_token)
  values (v_business_id, 'web_order-integrity-test')
  returning id into v_conversation_id;

  insert into products(business_id, name, price, stock_quantity)
  values (v_business_id, 'Test product', 250, 5)
  returning id into v_product_id;

  select r.order_id, r.message_id, r.replayed
    into v_order_id, v_message_id, v_replayed
    from place_order_atomic(
      v_business_id,
      v_conversation_id,
      'web_order-integrity-test',
      jsonb_build_array(jsonb_build_object('product_id', v_product_id, 'quantity', 1, 'unit_price', 100)),
      null,
      'order-integrity-inbound',
      'Order received',
      '{"handoff":true,"reason":"order"}'::jsonb,
      'order-integrity-reply'
    ) r;

  if v_replayed or v_order_id is null or v_message_id is null then
    raise exception 'first order attempt did not create an order and reply';
  end if;

  select oi.unit_price, o.total into v_unit_price, v_total
    from order_items oi
    join orders o on o.id = oi.order_id
   where oi.order_id = v_order_id;
  if v_unit_price <> 100 or v_total <> 100 then
    raise exception 'order did not preserve the quoted price (unit %, total %)', v_unit_price, v_total;
  end if;

  select r.order_id, r.message_id, r.replayed
    into v_replay_order_id, v_replay_message_id, v_replayed
    from place_order_atomic(
      v_business_id,
      v_conversation_id,
      'web_order-integrity-test',
      jsonb_build_array(jsonb_build_object('product_id', v_product_id, 'quantity', 1, 'unit_price', 999)),
      null,
      'order-integrity-inbound',
      'Order received',
      '{"handoff":true,"reason":"order"}'::jsonb,
      'order-integrity-reply'
    ) r;

  select stock_quantity into v_stock from products where id = v_product_id;
  select count(*) into v_count from orders where business_id = v_business_id and inbound_key = 'order-integrity-inbound';
  if not v_replayed or v_replay_order_id <> v_order_id or v_replay_message_id <> v_message_id or v_count <> 1 or v_stock <> 4 then
    raise exception 'duplicate inbound retry did not replay the original order exactly once';
  end if;

  v_order_id := create_manual_order_atomic(
    v_business_id,
    v_conversation_id,
    'web_manual-integrity-test',
    'placed',
    '[{"name":"Manual item","quantity":2,"unit_price":25}]'::jsonb
  );
  select total into v_total from orders where id = v_order_id;
  select count(*) into v_count from order_items where order_id = v_order_id;
  if v_total <> 50 or v_count <> 1 then
    raise exception 'manual order did not save its items and calculated total';
  end if;

  begin
    perform create_manual_order_atomic(
      v_business_id,
      v_conversation_id,
      'web_manual-atomic-failure',
      'placed',
      '[{"name":"force atomic failure","quantity":1,"unit_price":25}]'::jsonb
    );
  exception when others then
    v_failed := true;
  end;

  if not v_failed then
    raise exception 'manual order item failure was not surfaced';
  end if;
  if exists (select 1 from orders where customer_identifier = 'web_manual-atomic-failure') then
    raise exception 'manual order was left behind after item insertion failed';
  end if;
end
$$;

rollback;
