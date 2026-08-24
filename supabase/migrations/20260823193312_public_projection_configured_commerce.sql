-- The version timestamp matches the migration already applied to production.
-- Preserve the bounded merchant-authored commerce contract in the public page
-- projection. The original offer allowlist predates configured inputs,
-- recurring services, conditional fulfillment, staged settlement, and
-- reservable resources. Dropping those fields makes public consumers route
-- advanced offers through the generic one-time checkout rail.
--
-- Every nested object remains allowlisted. New keys stay private by default,
-- including keys added inside one of these public contract objects later.

create or replace function private.nz_public_jsonb_pick(input jsonb, allowed_keys text[])
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when input is null or jsonb_typeof(input) <> 'object' then null
    else nullif(
      (
        select jsonb_strip_nulls(jsonb_object_agg(entry.key, entry.value))
        from jsonb_each(input) as entry
        where entry.key = any(allowed_keys)
      ),
      '{}'::jsonb
    )
  end
$$;

create or replace function private.nz_public_jsonb_array_pick(input jsonb, allowed_keys text[])
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when input is null or jsonb_typeof(input) <> 'array' then null
    else (
      select jsonb_agg(private.nz_public_jsonb_pick(entry.elem, allowed_keys) order by entry.ord)
      from jsonb_array_elements(input) with ordinality as entry(elem, ord)
      where jsonb_typeof(entry.elem) = 'object'
    )
  end
$$;

create or replace function private.nz_public_offer_input_pricing(input jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case input ->> 'model'
    when 'option-delta' then jsonb_strip_nulls(
      coalesce(private.nz_public_jsonb_pick(input, array['model']), '{}'::jsonb)
      || jsonb_build_object(
        'adjustments',
        private.nz_public_jsonb_array_pick(input -> 'adjustments', array['value', 'delta'])
      )
    )
    when 'boolean-delta' then private.nz_public_jsonb_pick(
      input,
      array['model', 'trueDelta', 'falseDelta']
    )
    when 'quantity-delta' then private.nz_public_jsonb_pick(
      input,
      array['model', 'unitDelta', 'includedQuantity']
    )
    else null
  end
$$;

create or replace function private.nz_public_offer_customer_inputs(input jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when input is null or jsonb_typeof(input) <> 'array' then null
    else (
      select jsonb_agg(
        jsonb_strip_nulls(
          coalesce(
            private.nz_public_jsonb_pick(
              entry.elem,
              array['key', 'label', 'description', 'valueType', 'required', 'askBuyer', 'affects']
            ),
            '{}'::jsonb
          )
          || jsonb_build_object(
            'options', private.nz_public_jsonb_array_pick(entry.elem -> 'options', array['value', 'label']),
            'pricing', private.nz_public_offer_input_pricing(entry.elem -> 'pricing')
          )
        )
        order by entry.ord
      )
      from jsonb_array_elements(input) with ordinality as entry(elem, ord)
      where jsonb_typeof(entry.elem) = 'object'
    )
  end
$$;

create or replace function private.nz_public_recurring_cadence(input jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select private.nz_public_jsonb_pick(input, array['interval', 'intervalCount'])
$$;

create or replace function private.nz_public_recurring_options(input jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when input is null or jsonb_typeof(input) <> 'array' then null
    else (
      select jsonb_agg(
        jsonb_strip_nulls(
          coalesce(private.nz_public_jsonb_pick(entry.elem, array['value']), '{}'::jsonb)
          || jsonb_build_object(
            'cadence', private.nz_public_recurring_cadence(entry.elem -> 'cadence')
          )
        )
        order by entry.ord
      )
      from jsonb_array_elements(input) with ordinality as entry(elem, ord)
      where jsonb_typeof(entry.elem) = 'object'
    )
  end
$$;

create or replace function private.nz_public_recurring_schedule(input jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case input ->> 'mode'
    when 'fixed' then jsonb_strip_nulls(
      coalesce(private.nz_public_jsonb_pick(input, array['mode']), '{}'::jsonb)
      || jsonb_build_object(
        'cadence', private.nz_public_recurring_cadence(input -> 'cadence')
      )
    )
    when 'buyer-option' then jsonb_strip_nulls(
      coalesce(private.nz_public_jsonb_pick(input, array['mode', 'inputKey']), '{}'::jsonb)
      || jsonb_build_object(
        'options', private.nz_public_recurring_options(input -> 'options')
      )
    )
    else null
  end
$$;

create or replace function private.nz_public_recurring_terms(input jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when input is null or jsonb_typeof(input) <> 'object' then null
    else jsonb_strip_nulls(
      coalesce(
        private.nz_public_jsonb_pick(
          input,
          array[
            'schemaVersion',
            'paymentModel',
            'startPolicy',
            'endPolicy',
            'cancellationPolicy',
            'pausePolicy'
          ]
        ),
        '{}'::jsonb
      )
      || jsonb_build_object(
        'schedule', private.nz_public_recurring_schedule(input -> 'schedule')
      )
    )
  end
$$;

create or replace function private.nz_public_staged_settlement_terms(input jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when input is null or jsonb_typeof(input) <> 'object' then null
    else jsonb_strip_nulls(
      coalesce(
        private.nz_public_jsonb_pick(
          input,
          array['schemaVersion', 'paymentModel', 'approvalPolicy', 'mutationPolicy']
        ),
        '{}'::jsonb
      )
      || jsonb_build_object(
        'stages',
        private.nz_public_jsonb_array_pick(
          input -> 'stages',
          array['id', 'label', 'kind', 'allocationBps']
        )
      )
    )
  end
$$;

create or replace function private.nz_public_resource_quantity(input jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case input ->> 'source'
    when 'fixed' then private.nz_public_jsonb_pick(input, array['source', 'value'])
    when 'input' then private.nz_public_jsonb_pick(input, array['source', 'inputKey'])
    else null
  end
$$;

create or replace function private.nz_public_resource_requirements(input jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when input is null or jsonb_typeof(input) <> 'array' then null
    else (
      select jsonb_agg(
        jsonb_strip_nulls(
          coalesce(
            private.nz_public_jsonb_pick(entry.elem, array['poolId', 'windowId']),
            '{}'::jsonb
          )
          || jsonb_build_object(
            'quantity', private.nz_public_resource_quantity(entry.elem -> 'quantity')
          )
        )
        order by entry.ord
      )
      from jsonb_array_elements(input) with ordinality as entry(elem, ord)
      where jsonb_typeof(entry.elem) = 'object'
    )
  end
$$;

create or replace function private.nz_public_reservable_resource_terms(input jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when input is null or jsonb_typeof(input) <> 'object' then null
    else jsonb_strip_nulls(
      coalesce(private.nz_public_jsonb_pick(input, array['schemaVersion']), '{}'::jsonb)
      || jsonb_build_object(
        'requirements', private.nz_public_resource_requirements(input -> 'requirements')
      )
    )
  end
$$;

create or replace function private.nz_public_offer(input jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when input is null or jsonb_typeof(input) <> 'object' then input
    else jsonb_strip_nulls(jsonb_build_object(
      'name',                     input -> 'name',
      'description',              input -> 'description',
      'price',                    input -> 'price',
      'url',                      input -> 'url',
      'duration',                 input -> 'duration',
      'serviceArea',              input -> 'serviceArea',
      'isMobile',                 input -> 'isMobile',
      'travelFee',                input -> 'travelFee',
      'confidence',               input -> 'confidence',
      'source',                   input -> 'source',
      'prefer_original_for_this', input -> 'prefer_original_for_this',
      'availability',             input -> 'availability',
      'ab_test',                  input -> 'ab_test',
      'ab_label',                 input -> 'ab_label',
      'offerType',                input -> 'offerType',
      'tiers',                    private.nz_public_offer_tiers(input -> 'tiers'),
      'metadata',                 private.nz_public_offer_metadata(input -> 'metadata'),
      'rules',                    private.nz_public_offer_rules(input -> 'rules'),
      'customerInputs',           private.nz_public_offer_customer_inputs(input -> 'customerInputs'),
      'attributes',               private.nz_public_jsonb_array_pick(
                                    input -> 'attributes',
                                    array['key', 'label', 'valueType', 'value']
                                  ),
      'recurringTerms',           private.nz_public_recurring_terms(input -> 'recurringTerms'),
      'fulfillmentRules',         private.nz_public_jsonb_array_pick(
                                    input -> 'fulfillmentRules',
                                    array[
                                      'id',
                                      'inputKey',
                                      'operator',
                                      'value',
                                      'decision',
                                      'reasonCode',
                                      'message',
                                      'nextAction'
                                    ]
                                  ),
      'stagedSettlementTerms',    private.nz_public_staged_settlement_terms(input -> 'stagedSettlementTerms'),
      'reservableResourceTerms',  private.nz_public_reservable_resource_terms(input -> 'reservableResourceTerms')
    ))
  end
$$;

revoke all on function private.nz_public_jsonb_pick(jsonb, text[]) from public, anon, authenticated;
revoke all on function private.nz_public_jsonb_array_pick(jsonb, text[]) from public, anon, authenticated;
revoke all on function private.nz_public_offer_input_pricing(jsonb) from public, anon, authenticated;
revoke all on function private.nz_public_offer_customer_inputs(jsonb) from public, anon, authenticated;
revoke all on function private.nz_public_recurring_cadence(jsonb) from public, anon, authenticated;
revoke all on function private.nz_public_recurring_options(jsonb) from public, anon, authenticated;
revoke all on function private.nz_public_recurring_schedule(jsonb) from public, anon, authenticated;
revoke all on function private.nz_public_recurring_terms(jsonb) from public, anon, authenticated;
revoke all on function private.nz_public_staged_settlement_terms(jsonb) from public, anon, authenticated;
revoke all on function private.nz_public_resource_quantity(jsonb) from public, anon, authenticated;
revoke all on function private.nz_public_resource_requirements(jsonb) from public, anon, authenticated;
revoke all on function private.nz_public_reservable_resource_terms(jsonb) from public, anon, authenticated;
revoke all on function private.nz_public_offer(jsonb) from public, anon, authenticated;

update public.pages_public as projection
set products = private.nz_public_offer_array(page.products),
    services = private.nz_public_offer_array(page.services)
from public.pages as page
where page.id = projection.id;
