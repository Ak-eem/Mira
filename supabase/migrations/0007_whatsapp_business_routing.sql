-- The WhatsApp webhook (0006) currently routes every incoming message to
-- one hardcoded business by checking the incoming phone_number_id against
-- a single WHATSAPP_PHONE_NUMBER_ID env var, then looking up one specific
-- slug directly -- meaning only one business in the entire system could
-- ever use WhatsApp. This moves routing into the data: each business gets
-- its own number, and the webhook looks up whichever business owns the
-- number a message actually arrived on.
--
-- unique, not just indexed: two businesses configured with the same
-- phone_number_id would make routing ambiguous, so Postgres rejects that
-- outright rather than leaving it to be caught (or not) in application code.

alter table businesses
  add column whatsapp_phone_number_id text unique;
