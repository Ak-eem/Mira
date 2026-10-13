BEGIN;

CREATE TABLE IF NOT EXISTS public.school_academic_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    name text NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    is_current boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT school_academic_sessions_dates_check CHECK (end_date >= start_date),
    CONSTRAINT school_academic_sessions_business_name_key UNIQUE (business_id, name),
    CONSTRAINT school_academic_sessions_business_id_id_key UNIQUE (business_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_school_academic_sessions_one_current
    ON public.school_academic_sessions (business_id) WHERE is_current;

CREATE TABLE IF NOT EXISTS public.school_terms (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    academic_session_id uuid NOT NULL,
    name text NOT NULL,
    sequence integer NOT NULL DEFAULT 1,
    start_date date NOT NULL,
    end_date date NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT school_terms_dates_check CHECK (end_date >= start_date),
    CONSTRAINT school_terms_sequence_check CHECK (sequence > 0),
    CONSTRAINT school_terms_session_fk FOREIGN KEY (business_id, academic_session_id)
        REFERENCES public.school_academic_sessions (business_id, id) ON DELETE CASCADE,
    CONSTRAINT school_terms_business_session_name_key UNIQUE (business_id, academic_session_id, name),
    CONSTRAINT school_terms_business_id_id_key UNIQUE (business_id, id)
);

CREATE TABLE IF NOT EXISTS public.school_classes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    name text NOT NULL,
    arm text NOT NULL DEFAULT 'A',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT school_classes_business_name_arm_key UNIQUE (business_id, name, arm),
    CONSTRAINT school_classes_business_id_id_key UNIQUE (business_id, id)
);

CREATE TABLE IF NOT EXISTS public.school_fee_schedules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    class_id uuid NOT NULL,
    term_id uuid NOT NULL,
    amount numeric(12, 2) NOT NULL CHECK (amount >= 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT school_fee_schedules_class_fk FOREIGN KEY (business_id, class_id)
        REFERENCES public.school_classes (business_id, id) ON DELETE CASCADE,
    CONSTRAINT school_fee_schedules_term_fk FOREIGN KEY (business_id, term_id)
        REFERENCES public.school_terms (business_id, id) ON DELETE CASCADE,
    CONSTRAINT school_fee_schedules_business_class_term_key UNIQUE (business_id, class_id, term_id)
);

CREATE TABLE IF NOT EXISTS public.school_students (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    class_id uuid NOT NULL,
    admission_no text NOT NULL,
    full_name text NOT NULL,
    guardian_name text,
    guardian_phone text,
    guardian_email text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT school_students_class_fk FOREIGN KEY (business_id, class_id)
        REFERENCES public.school_classes (business_id, id) ON DELETE RESTRICT,
    CONSTRAINT school_students_business_admission_no_key UNIQUE (business_id, admission_no)
);

CREATE INDEX IF NOT EXISTS idx_school_academic_sessions_business ON public.school_academic_sessions (business_id);
CREATE INDEX IF NOT EXISTS idx_school_terms_business_session ON public.school_terms (business_id, academic_session_id);
CREATE INDEX IF NOT EXISTS idx_school_classes_business ON public.school_classes (business_id);
CREATE INDEX IF NOT EXISTS idx_school_fee_schedules_business_term ON public.school_fee_schedules (business_id, term_id);
CREATE INDEX IF NOT EXISTS idx_school_students_business_class ON public.school_students (business_id, class_id);

CREATE OR REPLACE FUNCTION public.set_school_layer_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER set_school_academic_sessions_updated_at BEFORE UPDATE ON public.school_academic_sessions
    FOR EACH ROW EXECUTE FUNCTION public.set_school_layer_updated_at();
CREATE TRIGGER set_school_terms_updated_at BEFORE UPDATE ON public.school_terms
    FOR EACH ROW EXECUTE FUNCTION public.set_school_layer_updated_at();
CREATE TRIGGER set_school_classes_updated_at BEFORE UPDATE ON public.school_classes
    FOR EACH ROW EXECUTE FUNCTION public.set_school_layer_updated_at();
CREATE TRIGGER set_school_fee_schedules_updated_at BEFORE UPDATE ON public.school_fee_schedules
    FOR EACH ROW EXECUTE FUNCTION public.set_school_layer_updated_at();
CREATE TRIGGER set_school_students_updated_at BEFORE UPDATE ON public.school_students
    FOR EACH ROW EXECUTE FUNCTION public.set_school_layer_updated_at();

ALTER TABLE public.school_academic_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_fee_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_students ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Business owners manage school academic sessions" ON public.school_academic_sessions
    FOR ALL TO authenticated USING (public.is_business_owner(business_id))
    WITH CHECK (public.is_business_owner(business_id));
CREATE POLICY "Platform admins manage school academic sessions" ON public.school_academic_sessions
    FOR ALL TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());
CREATE POLICY "Business owners manage school terms" ON public.school_terms
    FOR ALL TO authenticated USING (public.is_business_owner(business_id))
    WITH CHECK (public.is_business_owner(business_id));
CREATE POLICY "Platform admins manage school terms" ON public.school_terms
    FOR ALL TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());
CREATE POLICY "Business owners manage school classes" ON public.school_classes
    FOR ALL TO authenticated USING (public.is_business_owner(business_id))
    WITH CHECK (public.is_business_owner(business_id));
CREATE POLICY "Platform admins manage school classes" ON public.school_classes
    FOR ALL TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());
CREATE POLICY "Business owners manage school fee schedules" ON public.school_fee_schedules
    FOR ALL TO authenticated USING (public.is_business_owner(business_id))
    WITH CHECK (public.is_business_owner(business_id));
CREATE POLICY "Platform admins manage school fee schedules" ON public.school_fee_schedules
    FOR ALL TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());
CREATE POLICY "Business owners manage school students" ON public.school_students
    FOR ALL TO authenticated USING (public.is_business_owner(business_id))
    WITH CHECK (public.is_business_owner(business_id));
CREATE POLICY "Platform admins manage school students" ON public.school_students
    FOR ALL TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

COMMIT;
