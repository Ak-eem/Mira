create table whatsapp_processed_messages (
  id uuid primary key default gen_random_uuid(),
  message_id text not null unique,
  waba_phone_number_id text not null,
  created_at timestamptz not null default now()
);
create index idx_whatsapp_processed_messages_phone_number on whatsapp_processed_messages(waba_phone_number_id);
