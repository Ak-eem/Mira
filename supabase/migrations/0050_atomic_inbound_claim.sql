-- Atomic claim for the inbound queues.
--
-- The app used to claim a row with `attempts: row.attempts + 1`, where
-- row.attempts came from a read the caller did earlier. If another worker
-- claimed and failed the row in between, that stale value made the counter go
-- backwards, and the stale-lock reclaim path never re-checked the cap against
-- the real value, so a poison message could be redelivered past
-- MAX_INBOUND_ATTEMPTS.
--
-- These functions do the whole claim in one UPDATE: increment from the current
-- row value, enforce the cap, and cover both the normal claim
-- (pending/failed and due) and the stale-lock reclaim (processing and lock
-- older than p_stale_after_seconds). Uses the database clock throughout.
--
-- Returns true only if this caller won the claim.

create or replace function claim_whatsapp_inbound(
  p_id uuid,
  p_max_attempts integer,
  p_stale_after_seconds integer default 300
)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  v_claimed uuid;
begin
  update whatsapp_inbound_queue
     set status = 'processing',
         locked_at = now(),
         attempts = attempts + 1
   where id = p_id
     and attempts < p_max_attempts
     and (
       (status in ('pending', 'failed') and available_at <= now())
       or (status = 'processing' and locked_at < now() - make_interval(secs => p_stale_after_seconds))
     )
  returning id into v_claimed;

  return v_claimed is not null;
end;
$$;

create or replace function claim_email_inbound(
  p_id uuid,
  p_max_attempts integer,
  p_stale_after_seconds integer default 300
)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  v_claimed uuid;
begin
  update email_inbound_queue
     set status = 'processing',
         locked_at = now(),
         attempts = attempts + 1
   where id = p_id
     and attempts < p_max_attempts
     and (
       (status in ('pending', 'failed') and available_at <= now())
       or (status = 'processing' and locked_at < now() - make_interval(secs => p_stale_after_seconds))
     )
  returning id into v_claimed;

  return v_claimed is not null;
end;
$$;

revoke all on function claim_whatsapp_inbound(uuid, integer, integer) from public, anon, authenticated;
grant execute on function claim_whatsapp_inbound(uuid, integer, integer) to service_role;
revoke all on function claim_email_inbound(uuid, integer, integer) from public, anon, authenticated;
grant execute on function claim_email_inbound(uuid, integer, integer) to service_role;
