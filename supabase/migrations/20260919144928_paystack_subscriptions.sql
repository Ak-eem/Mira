-- Paystack subscription storage and idempotent, service-role-only activation.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- If your project already has public.businesses, keep its existing table and
-- ensure it has a unique user_id and a business_name column before using the RPC.
CREATE TABLE IF NOT EXISTS public.businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  business_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan text NOT NULL CHECK (plan IN ('starter', 'pro')),
  status text NOT NULL CHECK (status IN ('active', 'expired', 'cancelled')),
  reference text NOT NULL UNIQUE,
  amount integer NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.subscriptions FROM anon, authenticated;
GRANT SELECT ON TABLE public.subscriptions TO authenticated;
DROP POLICY IF EXISTS admin_can_select_subscriptions ON public.subscriptions;
CREATE POLICY admin_can_select_subscriptions ON public.subscriptions
  FOR SELECT TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE OR REPLACE FUNCTION public.activate_paystack_subscription(
  p_user_id uuid, p_plan text, p_reference text, p_amount integer,
  p_business_name text, p_duration_days integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  inserted_id uuid;
BEGIN
  IF p_user_id IS NULL OR p_plan NOT IN ('starter', 'pro') OR p_reference IS NULL OR btrim(p_reference) = ''
     OR p_amount IS NULL OR p_amount <= 0 OR p_duration_days IS NULL OR p_duration_days <= 0
     OR p_business_name IS NULL OR btrim(p_business_name) = '' THEN
    RAISE EXCEPTION 'invalid Paystack activation input';
  END IF;

  INSERT INTO public.subscriptions (user_id, plan, status, reference, amount, expires_at)
  VALUES (p_user_id, p_plan, 'active', p_reference, p_amount, now() + make_interval(days => p_duration_days))
  ON CONFLICT (reference) DO NOTHING
  RETURNING id INTO inserted_id;

  IF inserted_id IS NOT NULL THEN
    INSERT INTO public.businesses (user_id, business_name)
    VALUES (p_user_id, btrim(p_business_name))
    ON CONFLICT (user_id) DO UPDATE
      SET business_name = EXCLUDED.business_name, updated_at = now();
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.activate_paystack_subscription(uuid, text, text, integer, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_paystack_subscription(uuid, text, text, integer, text, integer) TO service_role;
