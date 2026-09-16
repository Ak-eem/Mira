create table if not exists email_inbound_queue (
  id uuid primary key default gen_random_uuid(),
  resend_email_id text not null unique,
  to_address text not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending','processing','done','failed')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

create index if not exists email_inbound_queue_available_idx on email_inbound_queue(status, available_at);