BEGIN;

-- Onboarding: a business can now be left mid-wizard (closed the tab,
-- answered 2 of 4 questions) without losing where they got to, and the
-- portal can tell "never started" apart from "finished" apart from
-- "started and abandoned" by checking these two columns together.
ALTER TABLE public.businesses
    ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz,
    -- Free text, not a fixed enum: the real courier list will grow past
    -- Shiip (GIGL, Kwik, DHL, Courier Plus...) and a CHECK constraint would
    -- need a migration every time a new one is added. Validated in
    -- application code against a known list instead; NULL means "no
    -- courier chosen yet / does their own delivery", which is a normal,
    -- common, permanent state -- not a placeholder waiting to be filled in.
    ADD COLUMN IF NOT EXISTS logistics_provider text,
    ADD COLUMN IF NOT EXISTS wants_email_channel boolean,
    ADD COLUMN IF NOT EXISTS tracks_inventory boolean;

-- One row per (business, courier) connection. A business could plausibly
-- connect more than one courier over time (switch providers, use two for
-- different regions), so this is its own table rather than more columns
-- on `businesses` -- and the unique constraint below still only allows
-- one ACTIVE connection per provider per business at a time, so there is
-- never an ambiguous "which Shiip account do we book through" question.
CREATE TABLE IF NOT EXISTS public.business_logistics_accounts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    provider text NOT NULL,
    -- Credentials are encrypted in application code (TypeScript) before
    -- this column is ever written, with the key held in an env var that
    -- never touches Postgres -- see lib/logistics/credentials.ts. This
    -- column stores ciphertext (base64), never plaintext, and nothing in
    -- SQL ever decrypts it: anyone with only database access (a leaked
    -- service-role key, a DB backup) gets unusable bytes, not a live
    -- courier credential.
    encrypted_credentials text NOT NULL,
    -- Per-provider, not a single platform-wide secret (unlike Paystack):
    -- each business sets up their OWN webhook URL in their OWN Shiip
    -- dashboard, so each connection has its own signing secret. Also
    -- encrypted; same reasoning as encrypted_credentials above.
    encrypted_webhook_secret text,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disconnected')),
    connected_at timestamptz NOT NULL DEFAULT now(),
    disconnected_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_logistics_accounts_business_provider_active
    ON public.business_logistics_accounts (business_id, provider)
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_logistics_accounts_business
    ON public.business_logistics_accounts (business_id);

ALTER TABLE public.business_logistics_accounts ENABLE ROW LEVEL SECURITY;

-- Mirrors the owner-access pattern used throughout (e.g. business_owners
-- checks in 0001/0014). Only the owning business's own members can see or
-- manage their own courier connection -- never another business's, and
-- never a plain customer's.
-- CREATE POLICY has no IF NOT EXISTS in Postgres (unlike tables/indexes),
-- so each is wrapped to keep this migration safely re-runnable like every
-- other one in this repo.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'business_logistics_accounts' AND policyname = 'logistics_accounts_owner_select') THEN
        CREATE POLICY logistics_accounts_owner_select ON public.business_logistics_accounts
            FOR SELECT
            USING (is_business_owner(business_id));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'business_logistics_accounts' AND policyname = 'logistics_accounts_owner_all') THEN
        CREATE POLICY logistics_accounts_owner_all ON public.business_logistics_accounts
            FOR ALL
            USING (is_business_owner(business_id))
            WITH CHECK (is_business_owner(business_id));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'business_logistics_accounts' AND policyname = 'logistics_accounts_platform_admin') THEN
        CREATE POLICY logistics_accounts_platform_admin ON public.business_logistics_accounts
            FOR ALL
            USING (is_platform_admin())
            WITH CHECK (is_platform_admin());
    END IF;
END $$;

REVOKE ALL ON public.business_logistics_accounts FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_logistics_accounts TO authenticated;
GRANT ALL ON public.business_logistics_accounts TO service_role;

-- Shipment bookings, one row per order shipped through a connected
-- courier. Separate from `orders` itself (not new columns on orders)
-- because an order could in principle be re-booked after a failed
-- attempt, and this keeps a full history rather than overwriting the
-- last attempt's result.
-- A courier webhook confirming delivery is neither a staff member nor the
-- customer; delivered_by previously only allowed those two, so a courier
-- webhook would have had to misattribute itself as 'staff'. Extending the
-- constraint rather than reusing 'staff' keeps that field honest for a
-- business owner later asking "who marked this delivered".
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_delivered_by_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_delivered_by_check
    CHECK (delivered_by IN ('customer', 'staff', 'courier'));

CREATE TABLE IF NOT EXISTS public.order_shipments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    logistics_account_id uuid NOT NULL REFERENCES public.business_logistics_accounts(id),
    provider text NOT NULL,
    -- The courier's OWN reference/shipment id, returned when a shipment is
    -- booked (e.g. Shiip's book-shipment response has both `reference` and
    -- `shipmentId`). This -- not orders.id -- is what the courier's
    -- webhook reports status changes against, so this is the join key an
    -- inbound webhook actually looks up by.
    courier_reference text,
    courier_shipment_id text,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'booked', 'picked_up', 'in_transit', 'delivered', 'failed', 'cancelled')),
    last_event jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- The actual mechanism that makes a webhook lookup safe: a courier's
-- reference is only ever looked up WITHIN one business_id. Two different
-- businesses getting coincidentally identical courier references (same
-- courier, or two different couriers) can never cross-match, because the
-- unique constraint -- and every real lookup query -- always includes
-- business_id as part of the key, never courier_reference alone.
CREATE UNIQUE INDEX IF NOT EXISTS idx_order_shipments_business_courier_ref
    ON public.order_shipments (business_id, provider, courier_reference)
    WHERE courier_reference IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_order_shipments_order ON public.order_shipments (order_id);
CREATE INDEX IF NOT EXISTS idx_order_shipments_business ON public.order_shipments (business_id);

ALTER TABLE public.order_shipments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'order_shipments' AND policyname = 'order_shipments_owner_select') THEN
        CREATE POLICY order_shipments_owner_select ON public.order_shipments
            FOR SELECT
            USING (is_business_owner(business_id));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'order_shipments' AND policyname = 'order_shipments_platform_admin') THEN
        CREATE POLICY order_shipments_platform_admin ON public.order_shipments
            FOR ALL
            USING (is_platform_admin())
            WITH CHECK (is_platform_admin());
    END IF;
END $$;

REVOKE ALL ON public.order_shipments FROM anon;
GRANT SELECT ON public.order_shipments TO authenticated;
GRANT ALL ON public.order_shipments TO service_role;

COMMIT;
