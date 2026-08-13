-- messages.business_id is a deliberate denormalization (kept for RLS
-- and query efficiency, rather than always joining through
-- conversations). Until now, "this always matches the parent
-- conversation's business_id" was true only because application code
-- was careful -- nothing at the database level actually required it.
--
-- This makes it structurally impossible to violate: a composite
-- foreign key on (conversation_id, business_id) means Postgres itself
-- rejects any insert or update where the pair doesn't match a real
-- conversation. Added alongside the existing single-column foreign
-- key, not replacing it -- both coexist harmlessly, and this avoids
-- needing to know Postgres's auto-generated name for the original
-- constraint just to drop it first.

-- A composite unique constraint on the parent side is required before
-- a composite foreign key can reference it. Trivially satisfiable --
-- id is already unique on its own, so (id, business_id) is too.
alter table conversations
  add constraint conversations_id_business_id_key unique (id, business_id);

alter table messages
  add constraint messages_conversation_business_match_fkey
  foreign key (conversation_id, business_id)
  references conversations (id, business_id)
  on delete cascade;

-- If this migration fails on your existing data, that itself is
-- important information: it means some message's business_id doesn't
-- actually match its conversation's, which would be worth finding and
-- fixing directly rather than something to route around.
