-- Doesn't exist anywhere in Mira yet -- nothing currently creates an
-- "order", Mira only answers questions about products. This is
-- status-tracking only, deliberately agnostic about HOW an order gets
-- created (right now: logged manually in the portal; later, maybe Mira
-- takes them directly -- that's a separate decision).
create table orders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete set null,
  -- Same shape as conversations.session_token (web_<visitorId> /
  -- wa_<phone>) on purpose: lets an order join back to a customer's chat
  -- history through the exact identity mechanism conversations already
  -- use, rather than inventing a second one.
  customer_identifier text not null,
  status text not null default 'cart' check (status in ('cart', 'placed', 'shipped', 'delivered', 'cancelled')),
  total numeric(12, 2),
  status_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_orders_business_status on orders(business_id, status);
create index idx_orders_customer on orders(business_id, customer_identifier);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  name text not null, -- snapshot: survives the product being renamed or deleted later
  quantity integer not null default 1 check (quantity > 0),
  unit_price numeric(12, 2)
);
create index idx_order_items_order on order_items(order_id);

alter table orders enable row level security;
alter table order_items enable row level security;

create policy "admins manage orders" on orders
  for all using (is_platform_admin()) with check (is_platform_admin());
create policy "owners manage own orders" on orders
  for all using (is_business_owner(business_id)) with check (is_business_owner(business_id));

create policy "admins manage order_items" on order_items
  for all using (is_platform_admin()) with check (is_platform_admin());
create policy "owners manage own order_items" on order_items
  for all using (is_business_owner((select business_id from orders where id = order_items.order_id)))
  with check (is_business_owner((select business_id from orders where id = order_items.order_id)));
