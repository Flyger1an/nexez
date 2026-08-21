-- Pass 1: one authoritative negotiation/telemetry contract.
--
-- Negotiation writes become short database transactions so a message and its
-- state transition cannot diverge. Analytics writes become server-only, with
-- explicit provenance and replay keys. All RPCs below are service-role only;
-- ownership is still checked explicitly for owner decisions.

-- ---------------------------------------------------------------------------
-- Negotiation state + message sequencing
-- ---------------------------------------------------------------------------

alter table public.agent_negotiations
  drop constraint if exists agent_negotiations_status_check;

alter table public.agent_negotiations
  add constraint agent_negotiations_status_check
  check (status = any (array[
    'negotiation','agreement_proposed','paused','held','complete','declined',
    'expired','refunded','disputed'
  ]));

alter table public.negotiation_messages
  add column if not exists decision_seq integer;

alter table public.negotiation_messages
  drop constraint if exists negotiation_messages_decision_seq_positive;

alter table public.negotiation_messages
  add constraint negotiation_messages_decision_seq_positive
  check (decision_seq is null or decision_seq > 0);

create unique index if not exists negotiation_messages_decision_seq_uidx
  on public.negotiation_messages (negotiation_id, decision_seq)
  where decision_seq is not null;

-- Fresh negotiation + first buyer turn. A single statement-level RPC prevents
-- an orphan pending row when the message insert fails.
create or replace function public.nz_create_negotiation_with_buyer_turn(
  p_negotiation jsonb,
  p_message jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_row public.agent_negotiations%rowtype;
begin
  if coalesce(p_message ->> 'role', '') <> 'buyer' then
    raise exception 'first negotiation message must be a buyer turn'
      using errcode = 'check_violation';
  end if;

  insert into public.agent_negotiations (
    id, page_id, owner_id, slug, offer_key, offer_name, offer_kind, currency,
    buyer_agent, buyer_query, requested_terms, budget_text, timeline_text,
    contact, buyer_email, status, escrow_mode, amount_cents,
    status_token_sha256, status_token_encrypted,
    idempotency_key_hash, idempotency_request_hash,
    decision_pending, decision_requested_at, metadata
  ) values (
    (p_negotiation ->> 'id')::uuid,
    (p_negotiation ->> 'page_id')::uuid,
    nullif(p_negotiation ->> 'owner_id', '')::uuid,
    p_negotiation ->> 'slug',
    p_negotiation ->> 'offer_key',
    p_negotiation ->> 'offer_name',
    p_negotiation ->> 'offer_kind',
    lower(coalesce(nullif(p_negotiation ->> 'currency', ''), 'usd')),
    nullif(p_negotiation ->> 'buyer_agent', ''),
    nullif(p_negotiation ->> 'buyer_query', ''),
    coalesce(p_negotiation -> 'requested_terms', '{}'::jsonb),
    nullif(p_negotiation ->> 'budget_text', ''),
    nullif(p_negotiation ->> 'timeline_text', ''),
    nullif(p_negotiation ->> 'contact', ''),
    nullif(p_negotiation ->> 'buyer_email', ''),
    'negotiation',
    coalesce(nullif(p_negotiation ->> 'escrow_mode', ''), 'not_configured'),
    null,
    nullif(p_negotiation ->> 'status_token_sha256', ''),
    nullif(p_negotiation ->> 'status_token_encrypted', ''),
    nullif(p_negotiation ->> 'idempotency_key_hash', ''),
    nullif(p_negotiation ->> 'idempotency_request_hash', ''),
    true,
    coalesce(nullif(p_negotiation ->> 'decision_requested_at', '')::timestamptz, clock_timestamp()),
    coalesce(p_negotiation -> 'metadata', '{}'::jsonb)
  )
  returning * into v_row;

  insert into public.negotiation_messages (
    negotiation_id, role, content, idempotency_key_hash, idempotency_request_hash
  ) values (
    v_row.id,
    'buyer',
    coalesce(p_message -> 'content', '{}'::jsonb),
    nullif(p_message ->> 'idempotency_key_hash', ''),
    nullif(p_message ->> 'idempotency_request_hash', '')
  );

  return to_jsonb(v_row);
end;
$$;

-- Continuation queue + buyer turn. The row lock makes the pending check and
-- message append one operation, closing the prior pending-without-message gap.
create or replace function public.nz_queue_negotiation_buyer_turn(
  p_negotiation_id uuid,
  p_content jsonb,
  p_idempotency_key_hash text default null,
  p_idempotency_request_hash text default null,
  p_requested_at timestamptz default clock_timestamp()
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_row public.agent_negotiations%rowtype;
begin
  select * into v_row
  from public.agent_negotiations
  where id = p_negotiation_id
  for update;

  if not found then
    raise exception 'negotiation not found' using errcode = 'no_data_found';
  end if;
  if v_row.decision_pending then
    raise exception 'a decision is already pending' using errcode = 'object_in_use';
  end if;
  if v_row.status not in ('negotiation', 'agreement_proposed') then
    raise exception 'negotiation is closed to buyer turns' using errcode = 'check_violation';
  end if;

  insert into public.negotiation_messages (
    negotiation_id, role, content, idempotency_key_hash, idempotency_request_hash
  ) values (
    v_row.id, 'buyer', coalesce(p_content, '{}'::jsonb),
    p_idempotency_key_hash, p_idempotency_request_hash
  );

  update public.agent_negotiations
  set decision_pending = true,
      decision_requested_at = p_requested_at,
      decision_claimed_at = null,
      updated_at = p_requested_at
  where id = v_row.id
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

-- Automated decision persistence. A stale worker loses cleanly when an owner
-- has already superseded it or another worker advanced the sequence.
create or replace function public.nz_persist_automated_negotiation_decision(
  p_negotiation_id uuid,
  p_expected_seq integer,
  p_status text,
  p_content jsonb,
  p_decision jsonb,
  p_rules_evaluation jsonb,
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
  v_next_seq integer := p_expected_seq + 1;
begin
  select * into v_row
  from public.agent_negotiations
  where id = p_negotiation_id
  for update;

  if not found then
    raise exception 'negotiation not found' using errcode = 'no_data_found';
  end if;
  if not v_row.decision_pending or v_row.decision_seq <> p_expected_seq then
    return jsonb_build_object('applied', false, 'decision_seq', v_row.decision_seq);
  end if;
  if coalesce(p_decision ->> 'action', '') not in ('accept','counter','reject','clarify','review') then
    raise exception 'invalid automated decision action' using errcode = 'check_violation';
  end if;

  insert into public.negotiation_messages (
    negotiation_id, role, content, decision_seq
  ) values (
    v_row.id, 'seller_llm', coalesce(p_content, '{}'::jsonb), v_next_seq
  );

  update public.agent_negotiations
  set status = p_status,
      amount_cents = case when p_amount_cents is not null then p_amount_cents else amount_cents end,
      settlement_state = case when p_settlement_state is not null then p_settlement_state else settlement_state end,
      decision_seq = v_next_seq,
      decision_pending = false,
      decision_claimed_at = null,
      updated_at = p_updated_at,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'last_decision', p_decision,
        'rules_evaluation', coalesce(p_rules_evaluation, '{}'::jsonb),
        'history_source', 'negotiation_messages',
        'decision_source', 'seller_llm'
      )
  where id = v_row.id
  returning * into v_row;

  return jsonb_build_object('applied', true, 'decision_seq', v_next_seq, 'negotiation', to_jsonb(v_row));
end;
$$;

-- Human decision persistence. The route supplies the authenticated owner id;
-- this transaction re-checks ownership under the row lock before doing anything.
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
    if v_row.status <> 'paused' then
      raise exception 'only paused negotiations can be resumed' using errcode = 'check_violation';
    end if;
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

revoke execute on function public.nz_create_negotiation_with_buyer_turn(jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.nz_queue_negotiation_buyer_turn(uuid, jsonb, text, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.nz_persist_automated_negotiation_decision(uuid, integer, text, jsonb, jsonb, jsonb, integer, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.nz_apply_owner_decision(uuid, uuid, integer, jsonb, integer, text, timestamptz) from public, anon, authenticated;

grant execute on function public.nz_create_negotiation_with_buyer_turn(jsonb, jsonb) to service_role;
grant execute on function public.nz_queue_negotiation_buyer_turn(uuid, jsonb, text, text, timestamptz) to service_role;
grant execute on function public.nz_persist_automated_negotiation_decision(uuid, integer, text, jsonb, jsonb, jsonb, integer, text, timestamptz) to service_role;
grant execute on function public.nz_apply_owner_decision(uuid, uuid, integer, jsonb, integer, text, timestamptz) to service_role;

-- All owner mutations now travel through authenticated server routes, which use
-- the service-role RPCs above after checking the caller. Keep owner reads only.
drop policy if exists "owners can update negotiations" on public.agent_negotiations;
revoke update on public.agent_negotiations from authenticated;

drop policy if exists "owners can insert messages for their negotiations" on public.negotiation_messages;
revoke insert on public.negotiation_messages from authenticated;

-- ---------------------------------------------------------------------------
-- Authoritative analytics provenance + replay protection
-- ---------------------------------------------------------------------------

alter table public.checkout_events
  add column if not exists ingestion_key text,
  add column if not exists ingestion_source text not null default 'legacy',
  add column if not exists trust_level text not null default 'legacy_unverified';

alter table public.agent_visits
  add column if not exists ingestion_key text,
  add column if not exists ingestion_source text not null default 'legacy',
  add column if not exists trust_level text not null default 'legacy_unverified';

alter table public.checkout_events
  drop constraint if exists checkout_events_ingestion_key_format,
  drop constraint if exists checkout_events_trust_level_check;
alter table public.checkout_events
  add constraint checkout_events_ingestion_key_format
    check (ingestion_key is null or ingestion_key ~ '^[0-9a-f]{64}$'),
  add constraint checkout_events_trust_level_check
    check (trust_level in ('verified_server','unverified_client','legacy_unverified'));

alter table public.agent_visits
  drop constraint if exists agent_visits_ingestion_key_format,
  drop constraint if exists agent_visits_trust_level_check;
alter table public.agent_visits
  add constraint agent_visits_ingestion_key_format
    check (ingestion_key is null or ingestion_key ~ '^[0-9a-f]{64}$'),
  add constraint agent_visits_trust_level_check
    check (trust_level in ('verified_server','unverified_client','legacy_unverified'));

create unique index if not exists checkout_events_ingestion_key_uidx
  on public.checkout_events (ingestion_key)
  where ingestion_key is not null;
create unique index if not exists agent_visits_ingestion_key_uidx
  on public.agent_visits (ingestion_key)
  where ingestion_key is not null;

drop policy if exists "Public can create checkout events for published pages" on public.checkout_events;
drop policy if exists "Public can create agent visits for published pages" on public.agent_visits;
revoke insert on public.checkout_events from anon, authenticated;
revoke insert on public.agent_visits from anon, authenticated;

comment on column public.checkout_events.trust_level is
  'Whether the event was produced by verified server ingestion or predates provenance enforcement.';
comment on column public.agent_visits.trust_level is
  'Whether detection was performed by verified server ingestion or predates provenance enforcement.';
