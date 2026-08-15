-- One row per (business, trigger type) they've turned on.
-- condition_json holds type-specific config (e.g. {"hours_threshold":24}
-- for abandoned_cart) rather than a column per trigger type, since the
-- 3 trigger types need differently-shaped config and more trigger types
-- are likely later. template_name is nullable on purpose -- a rule can
-- exist (and show up in the portal) before its Meta template is
-- approved; the cron just won't send anything for it until it's set.
create table nudge_rules (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  trigger_type text not null check (trigger_type in ('order_shipped', 'restock_alert', 'abandoned_cart')),
  template_name text,
  condition_json jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (business_id, trigger_type)
);

-- Every nudge actually sent (or attempted). The two partial unique
-- indexes below ARE the "haven't been nudged about it before" rule from
-- the spec, enforced at the DB level rather than just in application
-- logic -- if the cron somehow runs twice concurrently, the second
-- insert fails instead of double-sending. whatsapp_message_id gets
-- filled in once the Cloud API call returns, and is how the status
-- webhook (delivered/read) finds its way back to this row.
create table nudge_sends (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  nudge_rule_id uuid not null references nudge_rules(id) on delete cascade,
  customer_identifier text not null,
  order_id uuid references orders(id) on delete set null,
  restock_event_id uuid references product_restock_events(id) on delete set null,
  whatsapp_message_id text,
  status text not null default 'sent' check (status in ('sent', 'delivered', 'read', 'replied', 'failed')),
  sent_at timestamptz not null default now(),
  delivered_at timestamptz,
  read_at timestamptz,
  replied_at timestamptz
);
create unique index idx_nudge_sends_order_dedup
  on nudge_sends(nudge_rule_id, order_id) where order_id is not null;
create unique index idx_nudge_sends_restock_dedup
  on nudge_sends(nudge_rule_id, restock_event_id, customer_identifier) where restock_event_id is not null;
create index idx_nudge_sends_whatsapp_message
  on nudge_sends(whatsapp_message_id) where whatsapp_message_id is not null;
create index idx_nudge_sends_business on nudge_sends(business_id, sent_at desc);
create index idx_nudge_sends_customer_recent on nudge_sends(business_id, customer_identifier, sent_at desc);

-- Global per business, not per rule ("respected across ALL rules" per
-- the spec). A separate table rather than a flag on conversations:
-- conversations are per-session and can multiply, an opt-out has to
-- outlive any one of them. In practice this only really applies to
-- WhatsApp senders (wa_<phone>) -- there's no way to proactively nudge
-- a web widget visitor who isn't currently looking at the page, so
-- Nudges is a WhatsApp-only feature regardless of what's stored here.
create table nudge_opt_outs (
  business_id uuid not null references businesses(id) on delete cascade,
  customer_identifier text not null,
  opted_out_at timestamptz not null default now(),
  primary key (business_id, customer_identifier)
);

alter table nudge_rules enable row level security;
alter table nudge_sends enable row level security;
alter table nudge_opt_outs enable row level security;

create policy "admins manage nudge_rules" on nudge_rules
  for all using (is_platform_admin()) with check (is_platform_admin());
create policy "owners manage own nudge_rules" on nudge_rules
  for all using (is_business_owner(business_id)) with check (is_business_owner(business_id));

create policy "admins manage nudge_sends" on nudge_sends
  for all using (is_platform_admin()) with check (is_platform_admin());
create policy "owners read own nudge_sends" on nudge_sends
  for select using (is_business_owner(business_id));

create policy "admins manage nudge_opt_outs" on nudge_opt_outs
  for all using (is_platform_admin()) with check (is_platform_admin());
create policy "owners read own nudge_opt_outs" on nudge_opt_outs
  for select using (is_business_owner(business_id));
