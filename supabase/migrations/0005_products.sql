-- Phase 1 of orders/payments: products. A business can now sell actual
-- items (stock, fixed price) alongside or instead of services (which stay
-- exactly as they were -- a haircut isn't a product, and a business that's
-- purely service-based shouldn't need to touch this table at all).
--
-- Deliberately its own table rather than reusing `services`: a service's
-- price can be null ("price on request", you negotiate before booking),
-- but an order needs a real number to total up -- so price is required
-- here. stock_quantity is nullable on purpose: null means "not tracked,
-- always available if is_available is true", a number means real,
-- decrementable inventory. Reuses is_platform_admin() from 0001, same as
-- every other table.

create table products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  description text,
  price numeric(12,2) not null check (price >= 0),
  stock_quantity integer check (stock_quantity is null or stock_quantity >= 0),
  is_available boolean not null default true,
  availability_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_products_business on products(business_id);

alter table products enable row level security;

create policy "admins manage products" on products for all
  using (is_platform_admin()) with check (is_platform_admin());
