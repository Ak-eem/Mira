-- Follow-up to 0042.
--
-- 1. record_assistant_reply() now also records product interest inside the
--    same transaction. It used to be a separate fire-and-forget insert made
--    BEFORE the reply was saved, so a retry after a failure in between
--    recorded the same interest twice. It is now written exactly once, with
--    the reply, and skipped when the reply already exists (a retry).
--    A bad product id can never fail the reply: interest is best-effort
--    inside its own sub-transaction, matching the old non-fatal behaviour.
--
-- 2. WhatsApp send tracking. The Cloud API has no send idempotency key, so a
--    crash or timeout AFTER Meta accepted a message but BEFORE we recorded it
--    can't be detected from our side. These columns make that case explicit
--    and bounded instead of silent: see lib/whatsapp/inboundQueue.ts.

drop function if exists record_assistant_reply(uuid, uuid, text, jsonb, text, boolean);

create or replace function record_assistant_reply(
  p_conversation_id uuid,
  p_business_id uuid,
  p_content text,
  p_snapshot jsonb,
  p_inbound_key text default null,
  p_flag_handoff boolean default false,
  p_interest_product_ids uuid[] default null,
  p_customer_identifier text default null
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
  -- the existing row and change nothing (interest included).
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

  if p_interest_product_ids is not null
     and cardinality(p_interest_product_ids) > 0
     and p_customer_identifier is not null then
    begin
      -- Joined to products so an id from another business, or a product
      -- deleted mid-request, is dropped rather than raising.
      insert into product_interest (business_id, product_id, customer_identifier)
      select p_business_id, p.id, p_customer_identifier
        from unnest(p_interest_product_ids) as ids(pid)
        join products p on p.id = ids.pid and p.business_id = p_business_id;
    exception when others then
      raise warning 'product interest not recorded: %', sqlerrm;
    end;
  end if;

  return query select v_id, v_flagged;
end;
$$;

revoke all on function record_assistant_reply(uuid, uuid, text, jsonb, text, boolean, uuid[], text) from public, anon, authenticated;
grant execute on function record_assistant_reply(uuid, uuid, text, jsonb, text, boolean, uuid[], text) to service_role;

alter table whatsapp_inbound_queue
  add column if not exists send_started_at timestamptz,
  add column if not exists send_resent boolean not null default false,
  add column if not exists outbound_message_id text;
