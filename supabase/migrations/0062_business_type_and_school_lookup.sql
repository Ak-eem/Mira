BEGIN;

-- Marks which vertical a business belongs to, so vertical-specific portal
-- UI (school classes/terms/fees) and AI-context sections only apply where
-- relevant. 0057_school_layer.sql's tables exist for every business today
-- with nothing gating them; this is the flag that gating is built on.
ALTER TABLE public.businesses
    ADD COLUMN IF NOT EXISTS business_type text NOT NULL DEFAULT 'general';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'businesses_business_type_check'
    ) THEN
        ALTER TABLE public.businesses
            ADD CONSTRAINT businesses_business_type_check
            CHECK (business_type IN ('general', 'school'));
    END IF;
END $$;

-- A guardian messaging in on WhatsApp is looked up by phone number across
-- every student in the business (never across businesses -- business_id is
-- always part of the query). This is the index that lookup needs; without
-- it the match degenerates into a sequential scan per inbound message.
CREATE INDEX IF NOT EXISTS idx_school_students_business_guardian_phone
    ON public.school_students (business_id, guardian_phone)
    WHERE guardian_phone IS NOT NULL;

COMMIT;
