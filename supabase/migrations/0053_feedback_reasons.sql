-- Reason-coded feedback, alongside (not replacing) the thumbs.
--
-- message_feedback used to hold ONE anonymous up/down rating per message,
-- written by the chat widget through the service-role key. It now holds up to
-- two rows per message, told apart by `source`:
--
--   customer  the visitor's thumbs, optionally with a reason after a thumbs-down
--   staff     a business owner/staff member's review of the reply
--
-- Customers and staff judge different things (only the business can tell a
-- reply is out of date), so they are separate rows rather than one overwritten
-- verdict. Existing rows are all customer ratings and keep their meaning.
--
-- Safe to re-run.

alter table message_feedback
  add column if not exists source text not null default 'customer'
    check (source in ('customer', 'staff')),
  add column if not exists reason text
    check (reason in ('incorrect', 'incomplete', 'irrelevant', 'outdated', 'unclear')),
  add column if not exists note text,
  add column if not exists reviewer_id uuid references auth.users(id) on delete set null;

-- A reason explains a thumbs-down; it makes no sense on a thumbs-up.
alter table message_feedback drop constraint if exists message_feedback_reason_needs_down;
alter table message_feedback
  add constraint message_feedback_reason_needs_down check (reason is null or rating = 'down');

alter table message_feedback drop constraint if exists message_feedback_note_length;
alter table message_feedback
  add constraint message_feedback_note_length check (note is null or char_length(note) <= 500);

-- One row per (message, source) instead of one per message.
alter table message_feedback drop constraint if exists message_feedback_message_id_key;
alter table message_feedback drop constraint if exists message_feedback_message_source_key;
alter table message_feedback
  add constraint message_feedback_message_source_key unique (message_id, source);

-- Powers "what are people unhappy about, and why" later on.
create index if not exists idx_message_feedback_reason
  on message_feedback (reason)
  where reason is not null;

-- Reads are unchanged: platform admins (0011) and the business's own members
-- (0030) can read every row, customer and staff.
--
-- Writes for source = 'customer' stay service-role only (the widget has no
-- identity to check a policy against). Writes for source = 'staff' are done by
-- the signed-in business member, so the DATABASE enforces who may do it:
--   * only for an assistant message that belongs to a business they're a member of
--   * only as themselves (reviewer_id = their user id)
--   * only on staff rows -- they can never touch a customer's rating

drop policy if exists "members insert staff review" on message_feedback;
create policy "members insert staff review" on message_feedback
  for insert to authenticated
  with check (
    source = 'staff'
    and reviewer_id = auth.uid()
    and exists (
      select 1 from messages
      where messages.id = message_feedback.message_id
        and messages.role = 'assistant'
        and is_business_member(messages.business_id)
    )
  );

drop policy if exists "members update staff review" on message_feedback;
create policy "members update staff review" on message_feedback
  for update to authenticated
  using (
    source = 'staff'
    and exists (
      select 1 from messages
      where messages.id = message_feedback.message_id
        and is_business_member(messages.business_id)
    )
  )
  with check (
    source = 'staff'
    and reviewer_id = auth.uid()
    and exists (
      select 1 from messages
      where messages.id = message_feedback.message_id
        and messages.role = 'assistant'
        and is_business_member(messages.business_id)
    )
  );

drop policy if exists "members delete staff review" on message_feedback;
create policy "members delete staff review" on message_feedback
  for delete to authenticated
  using (
    source = 'staff'
    and exists (
      select 1 from messages
      where messages.id = message_feedback.message_id
        and is_business_member(messages.business_id)
    )
  );

-- ===== verification =====  (every ok should be true)
select 'source column' as check_name,
       exists (select 1 from information_schema.columns where table_name = 'message_feedback' and column_name = 'source') as ok
union all select 'reason column',
       exists (select 1 from information_schema.columns where table_name = 'message_feedback' and column_name = 'reason')
union all select 'unique (message_id, source)',
       exists (select 1 from pg_constraint where conname = 'message_feedback_message_source_key')
union all select 'old unique (message_id) removed',
       not exists (select 1 from pg_constraint where conname = 'message_feedback_message_id_key')
union all select 'staff insert policy',
       exists (select 1 from pg_policies where tablename = 'message_feedback' and policyname = 'members insert staff review')
union all select 'all existing rows are customer rows',
       not exists (select 1 from message_feedback where source <> 'customer');
