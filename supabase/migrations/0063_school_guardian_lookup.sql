BEGIN;

-- Looks up a student by matching an inbound WhatsApp phone number against
-- guardian_phone on file, scoped to one business. This is the ONLY
-- supported way application code may resolve "which student is this
-- parent asking about" -- it must never be done by listing students and
-- filtering in TypeScript, because that would mean the full roster (every
-- other family's data) passed through application memory on every
-- request. Scoping happens here, in SQL, before any row leaves the
-- database.
--
-- Both sides of the comparison are normalized to digits-only so a guardian
-- phone on file as "+234 803 123 4567", "0803-123-4567" or "2348031234567"
-- all match the same raw inbound number. This mirrors the normalization
-- already used for customer identifiers in
-- app/portal/(protected)/[businessId]/orders/actions.ts.
--
-- SECURITY DEFINER: a parent's session has no direct grant on
-- school_students (RLS only allows business owners/admins), so this
-- function runs with elevated privilege to do the lookup, then returns
-- only the single matching row's safe-to-share fields. search_path is
-- pinned so it can't be hijacked by a session-level search_path change.
CREATE OR REPLACE FUNCTION public.find_school_student_by_guardian_phone(
    p_business_id uuid,
    p_phone text
)
RETURNS TABLE (
    student_id uuid,
    full_name text,
    admission_no text,
    class_id uuid,
    class_name text,
    class_arm text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_digits text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
BEGIN
    IF p_business_id IS NULL OR v_digits = '' THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        s.id,
        s.full_name,
        s.admission_no,
        s.class_id,
        c.name,
        c.arm
    FROM public.school_students s
    JOIN public.school_classes c
        ON c.business_id = s.business_id AND c.id = s.class_id
    WHERE s.business_id = p_business_id
      AND s.guardian_phone IS NOT NULL
      -- Matched on the LAST 10 digits: Nigerian numbers are commonly
      -- stored with or without a country code / leading 0
      -- ("08031234567" vs "2348031234567" vs "+2348031234567"), and the
      -- last 10 digits are the part that's actually invariant across
      -- those forms.
      AND right(regexp_replace(s.guardian_phone, '[^0-9]', '', 'g'), 10) = right(v_digits, 10)
      AND right(v_digits, 10) != ''
    LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.find_school_student_by_guardian_phone(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_school_student_by_guardian_phone(uuid, text) TO service_role;

-- A guardian's own fee status for their matched student, for the current
-- academic session. Deliberately narrow: no payment history, no other
-- students, no other families' balances -- exactly what a parent asking
-- "has my child's fee been paid" needs, nothing more. Mirrors the same
-- SECURITY DEFINER + pinned search_path reasoning above.
CREATE OR REPLACE FUNCTION public.get_school_student_fee_status(
    p_business_id uuid,
    p_student_id uuid
)
RETURNS TABLE (
    term_name text,
    session_name text,
    amount_due numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF p_business_id IS NULL OR p_student_id IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        t.name,
        sess.name,
        fs.amount
    FROM public.school_students st
    JOIN public.school_fee_schedules fs
        ON fs.business_id = st.business_id AND fs.class_id = st.class_id
    JOIN public.school_terms t
        ON t.business_id = fs.business_id AND t.id = fs.term_id
    JOIN public.school_academic_sessions sess
        ON sess.business_id = t.business_id AND sess.id = t.academic_session_id
    WHERE st.business_id = p_business_id
      AND st.id = p_student_id
      AND sess.is_current
    ORDER BY t.sequence;
END;
$$;

REVOKE ALL ON FUNCTION public.get_school_student_fee_status(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_school_student_fee_status(uuid, uuid) TO service_role;

COMMIT;
