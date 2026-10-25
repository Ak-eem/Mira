BEGIN;

-- The inventory assistant was opt-in (0047: command_agent_enabled default
-- false) because it was a new write capability. The product decision is
-- now that it is simply part of Mira for every business: there is no
-- reason for an owner to have to find a settings toggle before a core
-- portal page works, and every change it proposes still needs the
-- owner's own confirmation before anything is written (see
-- app/portal/(protected)/[businessId]/inventory/actions.ts).
--
-- So: new businesses start enabled, and existing ones are switched on
-- ONCE. The owner-facing toggle is removed from the portal settings page.
-- The column and the platform-admin control stay as a kill switch, so
-- Mira's team can still turn it off for one business (abuse, a runaway
-- provider bill) without a deploy.
--
-- The backfill is guarded on the column default still being false (i.e.
-- this migration has not run yet). Without the guard, re-applying this
-- file -- which this repo's migrations are written to tolerate -- would
-- flip every business an admin had deliberately switched off back on.
DO $$
BEGIN
    IF (
        SELECT column_default
          FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'businesses'
           AND column_name = 'command_agent_enabled'
    ) = 'false' THEN
        UPDATE public.businesses SET command_agent_enabled = true;
    END IF;
END $$;

ALTER TABLE public.businesses
    ALTER COLUMN command_agent_enabled SET DEFAULT true;

COMMIT;
