-- Per-(business, customer) email consent for order-status notifications.
-- customer_identifier reuses the same web_<visitorId> / wa_<phone> shape
-- as conversations.session_token and orders.customer_identifier, so a
-- consent row joins straight onto an order without inventing a second
-- identity scheme -- the same reasoning as orders.customer_identifier in
-- 0015_orders.sql.
--
-- unsubscribe_token is a separate opaque value (not the identifier
-- itself) so the one-tap unsubscribe link placed in an email can't be
-- used to probe or guess another customer's identifier.
--
-- Writes only ever come from the service-role client (the widget's
-- consent-capture route, and the public unsubscribe route) -- same
-- reasoning as conversations/messages/orders: customers never get a
-- Supabase session for RLS to key off of. Owners get read-only access
-- here; nothing in the portal writes to this table.
create table customer_notification_preferences (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  customer_identifier text not null,
  email text not null,
  consented_at timestamptz not null default now(),
  opted_out_at timestamptz,
  unsubscribe_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  unique (business_id, customer_identifier)
);
create unique index idx_notification_prefs_unsub_token
  on customer_notification_preferences(unsubscribe_token);
-- Partial index on the lookup the send path actually does: "does this
-- customer have a live (non-opted-out) preference for this business".
create index idx_notification_prefs_active
  on customer_notification_preferences(business_id, customer_identifier)
  where opted_out_at is null;

alter table customer_notification_preferences enable row level security;

create policy "admins manage notification_preferences" on customer_notification_preferences
  for all using (is_platform_admin()) with check (is_platform_admin());
create policy "owners read own notification_preferences" on customer_notification_preferences
  for select using (is_business_owner(business_id));
