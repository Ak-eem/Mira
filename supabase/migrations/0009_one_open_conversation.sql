-- Nothing stopped two concurrent processMessage() calls for a brand-new
-- session from both missing the "find open conversation" select and both
-- inserting -- most exposed on WhatsApp, where a customer double-texting
-- sends two webhook deliveries that can genuinely be in flight together.
-- A partial unique index makes Postgres the tiebreaker instead of hoping
-- application code never races: the loser's insert fails with 23505 and
-- processMessage re-selects the winner's row instead of forking a second
-- conversation.

create unique index conversations_one_open_per_session
  on conversations (business_id, session_token)
  where status = 'open';
