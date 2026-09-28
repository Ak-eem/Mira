-- Paystack fields and service-role-only activation for the existing business subscription model.
ALTER TABLE public.business_subscriptions
  ADD COLUMN IF NOT EXISTS reference text UNIQUE,
  ADD COLUMN IF NOT EXISTS amount integer,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

CREATE OR REPLACE FUNCTION public.activate_paystack_subscription(
  p_business_id uuid,
  p_reference text,
  p_amount integer,
  p_expires_at timestamptz,
  p_expected_amount_kobo integer,
  p_plan text DEFAULT 'base'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  normalized_reference text := btrim(p_reference);
BEGIN
  IF p_business_id IS NULL
     OR p_reference IS NULL
     OR normalized_reference = ''
     OR p_amount IS NULL
     OR p_expected_amount_kobo IS NULL
     OR p_amount <> p_expected_amount_kobo
     OR p_expires_at IS NULL
     OR p_plan IS DISTINCT FROM 'base' THEN
    RAISE EXCEPTION 'invalid Paystack activation input';
  END IF;

  -- A successful retry for the same business/reference is a no-op.
  IF EXISTS (
    SELECT 1
    FROM public.business_subscriptions
    WHERE business_id = p_business_id
      AND reference = normalized_reference
      AND status = 'active'
  ) THEN
    RETURN;
  END IF;

  -- A Paystack reference must never activate another business.
  IF EXISTS (
    SELECT 1
    FROM public.business_subscriptions
    WHERE reference = normalized_reference
      AND business_id IS DISTINCT FROM p_business_id
  ) THEN
    RAISE EXCEPTION 'Paystack reference has already been used';
  END IF;

  INSERT INTO public.business_subscriptions (
    business_id,
    plan,
    status,
    reference,
    amount,
    paid_at,
    expires_at,
    updated_at
  )
  VALUES (
    p_business_id,
    p_plan,
    'active',
    normalized_reference,
    p_amount,
    now(),
    p_expires_at,
    now()
  )
  ON CONFLICT (business_id) DO UPDATE
  SET plan = EXCLUDED.plan,
      status = EXCLUDED.status,
      reference = EXCLUDED.reference,
      amount = EXCLUDED.amount,
      paid_at = EXCLUDED.paid_at,
      expires_at = EXCLUDED.expires_at,
      updated_at = now()
  WHERE business_subscriptions.status <> 'active'
     OR business_subscriptions.reference IS DISTINCT FROM EXCLUDED.reference;
END;
$$;

REVOKE ALL ON FUNCTION public.activate_paystack_subscription(uuid, text, integer, timestamptz, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_paystack_subscription(uuid, text, integer, timestamptz, integer, text) TO service_role;
