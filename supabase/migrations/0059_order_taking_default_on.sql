-- Orders from chat are now recorded automatically for every NEW business: AI order-taking (0051) was an
-- opt-in that defaulted to off, so most shops never got orders written down and kept typing them in by hand.
--
-- Only the default changes. Existing businesses keep whatever they have today (on or off), so nobody's
-- customers suddenly start placing orders. An owner can still switch it off in Settings, and orders Mira
-- takes still wait for staff confirmation.
alter table public.businesses
  alter column ai_order_taking set default true;
