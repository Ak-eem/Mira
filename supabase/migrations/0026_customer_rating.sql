-- Lets a customer end their own conversation from the widget (rather than
-- only via an operator's "End conversation" in admin/portal, see
-- app/admin/.../conversations/actions.ts) and rate the experience
-- afterward. ended_by distinguishes who closed the conversation: a
-- customer-initiated end, an operator-initiated one, or neither (the 24h
-- idle timeout close in lib/chat/processMessage.ts, or any conversation
-- that predates this column, leaves it null).
--
-- Only conversations the customer ended themselves can be rated (enforced
-- in app/api/chat/rate/route.ts by requiring ended_by = 'customer'), so
-- the rating columns are added alongside ended_by rather than in their
-- own migration.
alter table conversations add column if not exists ended_by text
  check (ended_by in ('customer', 'operator'));
alter table conversations add column if not exists customer_rating integer
  check (customer_rating between 1 and 5);
alter table conversations add column if not exists customer_rating_emoji text;
alter table conversations add column if not exists customer_rated_at timestamptz;
