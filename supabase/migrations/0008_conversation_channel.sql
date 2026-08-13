-- Explicit rather than inferred: the admin conversations list currently
-- has no way to show whether a conversation came from the web chat or
-- WhatsApp short of an admin recognizing the "wa_" prefix Mira happens
-- to put on WhatsApp session tokens today. That's a naming convention,
-- not data -- it'd silently stop working the moment that prefix ever
-- changed. An explicit column is the same kind of fix as 0004's
-- composite foreign key: don't leave something structurally true up to
-- application code consistently getting a convention right.

alter table conversations
  add column channel text not null default 'web'
    check (channel in ('web', 'whatsapp'));
