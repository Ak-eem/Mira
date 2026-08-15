-- Flags a conversation the AI has decided needs a person -- either the
-- customer explicitly asked for one, or Mira gave the canned "I don't
-- have that information" fallback twice in a row and a third try isn't a
-- good use of anyone's time. Defaults false; cleared by an admin from the
-- conversation thread once it's been picked up (see
-- app/admin/(protected)/businesses/[businessId]/conversations/actions.ts).
--
-- Partial index, same style as 0009's: the query that matters day to day
-- is "which conversations need me right now", not the full historical
-- set once something's been resolved.
alter table conversations
  add column needs_human boolean not null default false;

create index idx_conversations_needs_human
  on conversations (business_id, last_message_at desc)
  where needs_human = true;
