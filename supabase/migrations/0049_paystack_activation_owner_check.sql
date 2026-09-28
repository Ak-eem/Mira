-- Closes a gap in activate_paystack_subscription(): ownership was only
-- checked in app/api/paystack/verify/route.ts at checkout-initiation time
-- (via business_owners), and never re-checked at the point subscription
-- rows actually get written. The webhook path had no ownership check at
-- all, since Paystack's event payload carries no session to check against.
--
-- If a user_id is removed from business_owners while their payment is still
-- in flight (a staff member gets removed, a business changes hands), their
-- already-initiated payment could otherwise still activate the business's
-- subscription. This adds p_user_id as a required argument and verifies
-- membership inside the function itself, so both callers (/verify and the
-- webhook) go through the same check, in the one place they both converge.
--
-- The webhook does not have an authenticated user_id from Paystack's payload
-- directly -- it already carries metadata.user_id (the id that initiated
-- checkout), which is exactly what this checks.

DROP FUNCTION IF EXISTS public.activate_paystack_subscription(uuid, text, integer, timestamptz, integer, text);

CREATE OR REPLACE FUNCTION public.activate_paystack_subscription(
  p_business_id uuid,
  p_user_id uuid,
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
     OR p_user_id IS NULL
     OR p_reference IS NULL
     OR normalized_reference = ''
     OR p_amount IS NULL
     OR p_expected_amount_kobo IS NULL
     OR p_amount <> p_expected_amount_kobo
     OR p_expires_at IS NULL
     OR p_plan IS DISTINCT FROM 'base' THEN
    RAISE EXCEPTION 'invalid Paystack activation input';
  END IF;

  -- A successful retry for the same business/reference is a no-op. Checked
  -- before the ownership check so a membership change after a real payment
  -- already succeeded can never undo or re-raise on a harmless replay.
  IF EXISTS (
    SELECT 1
    FROM public.business_subscriptions
    WHERE business_id = p_business_id
      AND reference = normalized_reference
      AND status = 'active'
  ) THEN
    RETURN;
  END IF;

  -- The user who initiated checkout must still be an owner/staff member of
  -- this business at activation time, not just when checkout began.
  IF NOT EXISTS (
    SELECT 1
    FROM public.business_owners
    WHERE business_id = p_business_id
      AND user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'user is no longer associated with this business';
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

REVOKE ALL ON FUNCTION public.activate_paystack_subscription(uuid, uuid, text, integer, timestamptz, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_paystack_subscription(uuid, uuid, text, integer, timestamptz, integer, text) TO service_role;
