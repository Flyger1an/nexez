-- Pass 1 QA follow-up: a paused thread may only be resumed or rejected.
-- Keep the guard inside the locked transaction so clients cannot bypass the
-- application transition table by calling an otherwise valid decision action.
create or replace function public.nz_apply_owner_decision(
  p_negotiation_id uuid,
  p_owner_id uuid,
  p_expected_seq integer,
  p_decision jsonb,
  p_amount_cents integer default null,
  p_settlement_state text default null,
  p_updated_at timestamptz default clock_timestamp()
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_row public.agent_negotiations%rowtype;
  v_action text := p_decision ->> 'action';
  v_status text;
  v_next_seq integer;
  v_amount integer;
begin
  select * into v_row
  from public.agent_negotiations
  where id = p_negotiation_id and owner_id = p_owner_id
  for update;

  if not found then
    raise exception 'negotiation not found' using errcode = 'no_data_found';
  end if;
  if v_row.decision_seq <> p_expected_seq then
    raise exception 'negotiation changed; reload before responding' using errcode = 'serialization_failure';
  end if;
  if v_row.stripe_payment_intent_id is not null or v_row.status in ('held','complete','declined','expired','refunded','disputed') then
    raise exception 'funded or closed negotiations cannot receive owner decisions' using errcode = 'check_violation';
  end if;
  if v_action not in ('accept','counter','reject','clarify','pause','resume') then
    raise exception 'invalid owner decision action' using errcode = 'check_violation';
  end if;
  if v_row.status = 'paused' and v_action not in ('resume','reject') then
    raise exception 'paused negotiations may only be resumed or rejected' using errcode = 'check_violation';
  end if;
  if v_row.status <> 'paused' and v_action = 'resume' then
    raise exception 'only paused negotiations can be resumed' using errcode = 'check_violation';
  end if;

  v_amount := coalesce(p_amount_cents, v_row.amount_cents);
  if v_action = 'accept' then
    if v_amount is null or v_amount < 50 or p_settlement_state is null then
      raise exception 'accept requires an amount of at least 50 minor units and a settlement state'
        using errcode = 'check_violation';
    end if;
    v_status := 'agreement_proposed';
  elsif v_action = 'counter' then
    if p_amount_cents is null or p_amount_cents < 50 then
      raise exception 'counter requires an amount of at least 50 minor units'
        using errcode = 'check_violation';
    end if;
    v_status := 'negotiation';
  elsif v_action = 'reject' then
    v_status := 'declined';
  elsif v_action = 'pause' then
    if v_row.status not in ('negotiation','agreement_proposed') then
      raise exception 'only active negotiations can be paused' using errcode = 'check_violation';
    end if;
    v_status := 'paused';
  elsif v_action = 'resume' then
    v_status := 'negotiation';
  else
    v_status := 'negotiation';
  end if;

  v_next_seq := v_row.decision_seq + 1;

  insert into public.negotiation_messages (
    negotiation_id, role, content, decision_seq
  ) values (
    v_row.id,
    'seller_owner',
    jsonb_build_object('decision', p_decision, 'source', 'seller_owner'),
    v_next_seq
  );

  update public.agent_negotiations
  set status = v_status,
      amount_cents = case when v_action in ('accept','counter') then v_amount else amount_cents end,
      settlement_state = case when v_action = 'accept' then p_settlement_state else settlement_state end,
      decision_seq = v_next_seq,
      decision_pending = false,
      decision_claimed_at = null,
      updated_at = p_updated_at,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'last_decision', p_decision,
        'history_source', 'negotiation_messages',
        'decision_source', 'seller_owner'
      )
  where id = v_row.id
  returning * into v_row;

  return jsonb_build_object('applied', true, 'decision_seq', v_next_seq, 'negotiation', to_jsonb(v_row));
end;
$$;

revoke execute on function public.nz_apply_owner_decision(uuid, uuid, integer, jsonb, integer, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.nz_apply_owner_decision(uuid, uuid, integer, jsonb, integer, text, timestamptz)
  to service_role;
