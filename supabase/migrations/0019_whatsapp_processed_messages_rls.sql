alter table public.whatsapp_processed_messages enable row level security;
create policy "Service role can manage processed WhatsApp messages" on public.whatsapp_processed_messages for all to service_role using (true) with check (true);
