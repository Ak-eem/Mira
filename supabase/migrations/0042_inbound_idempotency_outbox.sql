-- Idempotent inbound processing + reply outbox.
--
-- Before this, both webhooks sent the reply and only THEN marked the queue
-- row done, and processMessage did its writes as separate round trips. A
-- failure anywhere in between made the retry re-run the whole pipeline:
-- duplicate customer row, duplicate assistant row, a freshly generated AI
-- reply, and a second outbound message.
--
-- 1. messages.inbound_key: a per-business unique key that makes the customer
--    insert and the assistant reply for one inbound message write-once.
-- 2. Outbox columns on both queue tables: the reply text is persisted on the
--    queue row BEFORE it is sent, so a retry re-sends the stored text instead
--    of regenerating it.
-- 3. record_assistant_reply(): the assistant message insert, the optional
--    needs_human flip, and the last_message_at bump in one transaction.

alter table messages add column if not exists inbound_key text;

create unique index if not exists messages_business_inbound_key_uidx
  on messages (business_id, inbound_key)
  where inbound_key is not null;

alter table whatsapp_inbound_queue
  add column if not exists reply_text text,
  add column if not exists reply_sent_at timestamptz;

alter table email_inbound_queue
  add column if not exists reply_text text,
  add column if not exists reply_sent_at timestamptz;

create or replace function record_assistant_reply(
  p_conversation_id uuid,
  p_business_id uuid,
  p_content text,
  p_snapshot jsonb,
  p_inbound_key text default null,
  p_flag_handoff boolean default false
)
returns table (message_id uuid, newly_flagged boolean)
language plpgsql
set search_path = public
as $$
declare
  v_id uuid;
  v_rows integer;
  v_flagged boolean := false;
begin
  -- Retry of an inbound message whose reply was already recorded: hand back
  -- the existing row and change nothing.
  if p_inbound_key is not null then
    select m.id into v_id
      from messages m
     where m.business_id = p_business_id and m.inbound_key = p_inbound_key;
    if v_id is not null then
      return query select v_id, false;
      return;
    end if;
  end if;

  if p_flag_handoff then
    update conversations
       set needs_human = true
     where id = p_conversation_id
       and business_id = p_business_id
       and needs_human = false;
    get diagnostics v_rows = row_count;
    v_flagged := v_rows > 0;
  end if;

  insert into messages (conversation_id, business_id, role, content, context_snapshot, inbound_key)
  values (p_conversation_id, p_business_id, 'assistant', p_content, p_snapshot, p_inbound_key)
  returning id into v_id;

  update conversations
     set last_message_at = now()
   where id = p_conversation_id
     and business_id = p_business_id;

  return query select v_id, v_flagged;
end;
$$;

revoke all on function record_assistant_reply(uuid, uuid, text, jsonb, text, boolean) from public, anon, authenticated;
grant execute on function record_assistant_reply(uuid, uuid, text, jsonb, text, boolean) to service_role;
