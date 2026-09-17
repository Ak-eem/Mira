update businesses
set email_inbound_address = lower(email_inbound_address)
where email_inbound_address is not null
  and email_inbound_address <> lower(email_inbound_address);

alter table businesses
  add constraint email_inbound_address_lowercase
  check (email_inbound_address = lower(email_inbound_address));