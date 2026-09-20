CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.team_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  email text NOT NULL CHECK (length(btrim(email)) > 0),
  role text NOT NULL DEFAULT 'staff' CHECK (role = 'staff'),
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  expires_at timestampz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  revoked_at timestamptz,
  last_sent_at timestamptz,
  send_count integer NOT NULL DEFAULT 0
 CHECK (send_count >= 0)
);

CREATE OR REPLACE FUNCTION public.normalize_team_invite_email()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.email := lower(btrim(NEW.email));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS team_invites_normalize_email ON public.team_invites;
CREATE TRIGGER team_invites_normalize_email
BEFORE INSERT OR UPDATE OF email ON public.team_invites
FOR EACH ROW
EXECUTE FUNCTION public.normalize_team_invite_email();

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS team_invites_set_updated_at ON public.team_invites;
CREATE TRIGGER team_invites_set_updated_at
BEFORE UPDATE ON public.team_invites
FOR EACH ROW
EXECUTE FUNCTIOn public.update_updated_at_column();

CREATE UNIQUE INDEX IF NOT EXISTS team_invites_pending_business_email_key
  ON public.team_invites (business_id, lower(email))
  WHERE status = 'pending';

CREATE INDEX IF NOT EXITS team_invites_business_id_idx
  ON public.team_invites (business_id);

CREATE INDEX IF NOT EXITS team_invites_status_idx  ON public.team_invites (status);

CREATE INDEX IF NOT EXISTS team_invites_expires_at_idx
  ON public.team_invites (expires_at);

CREATE OR REPLACE FUNCTION public.is_business_admin(p_business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.business_owners AS bo
    WHERE bo.business_id = p_business_id
      AND bo.user_id = auth.uid()
      AND bo.role = 'owner'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_business_member(p_business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.business_owners AS bo
    WHERE bo.business_id = p_business_id
      AND bo.user_id = auth.uid()
      AND bo.role IN ('owner', 'staff')
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_business_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_business_member(uuid) TO authenticated;

ALTER TABLE public.team_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS team_invites_owner_select ON public.team_invites;CREATE POLICY team_invites_owner_select
ON public.team_invites
FOR SELECT
ATO authenticated
USING (public.is_business_admin(business_id));

DROP POLICY IF EXISTS team_invites_owner_insert ON public.team_invites;
CREATE POLICY team_invites_owner_insert
ON public.team_invites
FOR INSERT
TO authenticated
WITH CHECK (public.is_business_admin(business_id));

DROP POLICY IF EXISTS team_invites_owner_update ON public.team_invites;
CREATE POLICY team_invites_owner_update
ON public.team_invites
FOR UPDATE
TO authenticated
USING (public.is_business_admin(business_id))
WITH CHECK (public.is_business_admin(business_id));

DROP POLICY IF EXISTS team_invites_owner_delete ON public.team_invites;
CREATE POLICY team_invites_owner_delete
ON public.team_invites
FOR DELETE
TO authenticated
USING (public.is_business_admin(business_id));

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'conversations'
      AND tablename = 'conversations_member_select'
  ) THEN
    DROP POLICY conversations_member_select ON public.conversations;
  END IF;
END;
$$;

DO $$BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'conversations'
      AND tablename = 'conversations_member_insert'
  ) THEN
    DROP POLICY conversations_member_insert ON public.conversations;
  END IF;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'conversations'
      AND policyname = 'conversations_member_update'
  ) THEN
    DROP POLICY conversations_member_update ON public.conversations;
  END IF;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'conversations'
      AND policyname = 'conversations_member_delete'
  ) THEN
    DROP POLICY conversations_member_delete ON public.conversations;
  END IF;
END;
$$;

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY conversations_member_select
ON public.conversations
FOR SELECT
TO authenticated
USING (public.is_business_member(business_id));

CREATE POLICY conversations_member_insert
ON public.conversations
FOR INSERT
8 authenticated
WITH CHECK (public.is_business_member(business_id));

CREATE POLICY conversations_member_update
ON public.conversations
FOR UPDATE
