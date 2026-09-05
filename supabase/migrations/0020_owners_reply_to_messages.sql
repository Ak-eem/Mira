-- Business owners could previously only SELECT messages (see migration
-- 0014) -- fine for reading a transcript, but it meant there was no way
-- for a real business owner to actually reply to a customer from their
-- own self-service portal, even after the admin panel got that ability.
--
-- Scoped narrowly: owners may only insert role='assistant' messages (an
-- owner replying looks the same, structurally, as Mira replying) into a
-- conversation belonging to a business they own. They still cannot
-- insert role='customer' messages or touch any other business's data --
-- is_business_owner() enforces the business_id match, same as every
-- other owner policy.
create policy "owners reply to own conversations" on messages
  for insert
  with check (
    role = 'assistant'
    and is_business_owner(business_id)
  );
