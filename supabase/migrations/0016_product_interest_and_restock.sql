-- "Interacted with that product" (Nudges spec, restock_alert targeting)
-- needs a real record of who's asked about what. Populated wherever
-- matchProductImages() already runs (lib/chat/processMessage.ts,
-- app/api/chat/route.ts) -- reusing that existing signal rather than
-- trying to mine it back out of message history later, which would only
-- catch products that happened to have an image_url set.
create table product_interest (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  customer_identifier text not null,
  created_at timestamptz not null default now()
);
create index idx_product_interest_product on product_interest(product_id, customer_identifier);

-- One row per "was out of stock, now isn't" transition (see
-- products/actions.ts's updateProduct). A dedicated event table rather
-- than a single products.restocked_at timestamp: a product can restock
-- more than once, and nudge_sends needs to reference the SPECIFIC event
-- a nudge was for, so re-running the cron before everyone's notified
-- doesn't skip people and a second later restock doesn't get silently
-- ignored because "we already nudged about this product once."
create table product_restock_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  restocked_at timestamptz not null default now()
);
create index idx_restock_events_product on product_restock_events(product_id, restocked_at desc);

alter table product_interest enable row level security;
alter table product_restock_events enable row level security;

-- Service-role only for writes (this is written by the chat pipeline and
-- the product-update action, both already service-role/admin-authed
-- server-side) -- owners and admins just need read access here.
create policy "admins manage product_interest" on product_interest
  for all using (is_platform_admin()) with check (is_platform_admin());
create policy "owners read own product_interest" on product_interest
  for select using (is_business_owner(business_id));

create policy "admins manage restock_events" on product_restock_events
  for all using (is_platform_admin()) with check (is_platform_admin());
create policy "owners read own restock_events" on product_restock_events
  for select using (is_business_owner(business_id));
