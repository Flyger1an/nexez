alter table public.checkout_configuration_handoffs
  add column if not exists fulfillment_snapshot jsonb,
  add column if not exists fulfillment_fingerprint text;

alter table public.checkout_configuration_handoffs
  drop constraint if exists checkout_configuration_handoffs_fulfillment_snapshot_check,
  add constraint checkout_configuration_handoffs_fulfillment_snapshot_check
    check (
      fulfillment_snapshot is null
      or (
        jsonb_typeof(fulfillment_snapshot) = 'object'
        and octet_length(fulfillment_snapshot::text) <= 65536
      )
    ),
  drop constraint if exists checkout_configuration_handoffs_fulfillment_fingerprint_check,
  add constraint checkout_configuration_handoffs_fulfillment_fingerprint_check
    check (
      fulfillment_fingerprint is null
      or fulfillment_fingerprint ~ '^[a-f0-9]{64}$'
    ),
  drop constraint if exists checkout_configuration_handoffs_fulfillment_pair_check,
  add constraint checkout_configuration_handoffs_fulfillment_pair_check
    check ((fulfillment_snapshot is null) = (fulfillment_fingerprint is null));

comment on column public.checkout_configuration_handoffs.fulfillment_snapshot is
  'Exact deterministic checkout-time evaluation of merchant-authored conditional fulfillment rules, including the exact normalized policy evaluated. Payable one-time checkout may persist only decision=eligible.';
comment on column public.checkout_configuration_handoffs.fulfillment_fingerprint is
  'SHA-256 fingerprint of the deterministic checkout-time fulfillment policy and evaluation.';

create or replace function public.apply_checkout_configuration_handoff()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  handoff public.checkout_configuration_handoffs%rowtype;
  pricing_final_amount bigint;
  pricing_currency text;
begin
  if new.stripe_session_id is null then
    return new;
  end if;

  select *
    into handoff
    from public.checkout_configuration_handoffs
   where stripe_session_id = new.stripe_session_id
     and offer_key = new.offer_key
     and expires_at > now()
     and (page_id is null or new.page_id is not distinct from page_id)
   for update;

  if found then
    new.metadata := coalesce(new.metadata, '{}'::jsonb) || jsonb_build_object(
      'offer_configuration', handoff.configuration,
      'offer_configuration_fingerprint', handoff.configuration_fingerprint,
      'offer_configuration_schema_version', 1
    );

    if handoff.pricing_snapshot is not null then
      if jsonb_typeof(handoff.pricing_snapshot -> 'finalAmount') <> 'number'
         or jsonb_typeof(handoff.pricing_snapshot -> 'currency') <> 'string'
         or jsonb_typeof(handoff.pricing_snapshot -> 'schemaVersion') <> 'number'
         or (handoff.pricing_snapshot ->> 'schemaVersion')::numeric <> 1 then
        raise exception 'invalid checkout configuration pricing snapshot for session %', new.stripe_session_id
          using errcode = '23514';
      end if;

      pricing_final_amount := (handoff.pricing_snapshot ->> 'finalAmount')::bigint;
      pricing_currency := lower(handoff.pricing_snapshot ->> 'currency');

      if pricing_final_amount is distinct from new.amount_cents::bigint then
        raise exception 'checkout pricing amount mismatch for session %', new.stripe_session_id
          using errcode = '23514';
      end if;

      if pricing_currency is distinct from lower(new.currency) then
        raise exception 'checkout pricing currency mismatch for session %', new.stripe_session_id
          using errcode = '23514';
      end if;

      new.metadata := new.metadata || jsonb_build_object(
        'offer_pricing', handoff.pricing_snapshot,
        'offer_pricing_fingerprint', handoff.pricing_fingerprint,
        'offer_pricing_schema_version', 1
      );
    end if;

    if handoff.fulfillment_snapshot is not null then
      if jsonb_typeof(handoff.fulfillment_snapshot -> 'schemaVersion') <> 'number'
         or (handoff.fulfillment_snapshot ->> 'schemaVersion')::numeric <> 1
         or jsonb_typeof(handoff.fulfillment_snapshot -> 'policyRules') <> 'array'
         or jsonb_typeof(handoff.fulfillment_snapshot -> 'decision') <> 'string'
         or jsonb_typeof(handoff.fulfillment_snapshot -> 'matchedRuleIds') <> 'array'
         or jsonb_typeof(handoff.fulfillment_snapshot -> 'reasons') <> 'array' then
        raise exception 'invalid checkout fulfillment snapshot for session %', new.stripe_session_id
          using errcode = '23514';
      end if;

      if handoff.fulfillment_snapshot ->> 'decision' is distinct from 'eligible' then
        raise exception 'non-eligible checkout fulfillment snapshot for session %', new.stripe_session_id
          using errcode = '23514';
      end if;

      new.metadata := new.metadata || jsonb_build_object(
        'offer_fulfillment', handoff.fulfillment_snapshot,
        'offer_fulfillment_fingerprint', handoff.fulfillment_fingerprint,
        'offer_fulfillment_schema_version', 1
      );
    end if;
  end if;

  return new;
end;
$$;
