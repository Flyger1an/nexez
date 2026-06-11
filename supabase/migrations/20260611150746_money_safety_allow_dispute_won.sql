create or replace function public.nz_negotiation_money_safety()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status = 'held' and new.stripe_payment_intent_id is null then
    raise exception 'negotiation %: cannot set held without a payment intent', new.id
      using errcode = 'check_violation';
  end if;

  if new.status = 'complete'
     and new.stripe_payment_intent_id is not null
     and coalesce(old.status, '') not in ('held', 'disputed')
     and coalesce(new.settlement_state, '') <> 'auto' then
    raise exception 'negotiation %: cannot complete a payment-backed negotiation without a captured hold', new.id
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;
