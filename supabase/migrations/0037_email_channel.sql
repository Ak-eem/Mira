alter table conversations drop constraint if exists conversations_channel_check;
alter table conversations add constraint conversations_channel_check
  check (channel in ('web', 'whatsapp', 'email'));

alter table ai_response_telemetry drop constraint if exists ai_response_telemetry_channel_check;
alter table ai_response_telemetry add constraint ai_response_telemetry_channel_check
  check (channel in ('web', 'whatsapp', 'email'));

alter table businesses
  add column if not exists email_inbound_address text unique;

alter table businesses
  add column if not exists email_responses_enabled boolean not null default false;