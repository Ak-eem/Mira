-- The tenant-isolation audit (supabase/tests/tenant_isolation.sql, check A5)
-- requires that every table with a business_id column either has a policy
-- scoping access to business membership, or is named in the audit's
-- server_only list. It cannot express "this table has no client grants at
-- all", which is the stricter thing 0067 actually does.
--
-- public.paystack_payments (0067) is server-only: RLS is on and anon /
-- authenticated have no table privileges, so no client can read or write it.
-- This migration adds a correctly scoped SELECT policy as well, so that if a
-- table grant is ever restored by accident, access is still limited to a
-- business's own payment rows rather than every tenant's.
--
-- The policy is inert while the grants stay revoked. Server code uses the
-- service-role key, which bypasses RLS either way.
--
-- Safe to re-run.

alter table public.paystack_payments enable row level security;

drop policy if exists paystack_payments_member_select on public.paystack_payments;
create policy paystack_payments_member_select on public.paystack_payments
for select to authenticated
using (is_business_member(business_id));

-- Defence in depth, not a grant: client privileges stay revoked.
revoke all on table public.paystack_payments from anon, authenticated;
