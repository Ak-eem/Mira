-- Weekly summary email to business owners.
--   * businesses.last_weekly_summary_at: when the last summary was sent, so each week's goes out once.
--   * business_owners.weekly_summary: each owner can turn their own copy off (default on).
--   * claim_weekly_summary(): atomic "I am the one sending this week's summary", so a retried or
--     overlapping cron run can never send it twice. Server-only.
--   * set_weekly_summary(): lets a signed-in owner change their own switch, and nobody else's.

alter table businesses add column if not exists last_weekly_summary_at timestamptz;
alter table business_owners add column if not exists weekly_summary boolean not null default true;

create or replace function public.claim_weekly_summary(p_business_id uuid, p_week_start timestamptz)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed uuid;
begin
  update businesses
     set last_weekly_summary_at = now()
   where id = p_business_id
     and (last_weekly_summary_at is null or last_weekly_summary_at < p_week_start)
  returning id into claimed;
  return claimed is not null;
end;
$$;

revoke all on function public.claim_weekly_summary(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.claim_weekly_summary(uuid, timestamptz) to service_role;

create or replace function public.set_weekly_summary(p_business_id uuid, p_enabled boolean)
returns void
language sql
security definer
set search_path = public
as $$
  update business_owners
     set weekly_summary = p_enabled
   where business_id = p_business_id
     and user_id = auth.uid()
     and role = 'owner';
$$;

revoke all on function public.set_weekly_summary(uuid, boolean) from public, anon;
grant execute on function public.set_weekly_summary(uuid, boolean) to authenticated;
