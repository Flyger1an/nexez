-- Red-team gauntlet finding #2: a funded (held) or terminal negotiation could be
-- re-driven back to agreement_proposed (detaching the live amount from the held/
-- captured PaymentIntent). The app layer now blocks the reopen; this is DB-level
-- defense-in-depth against any direct write.
create or replace function public.nz_negotiation_money_safety()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
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

  -- Reopen guard: agreement_proposed may only be reached from an active
  -- negotiating state. Never reverse a funded/terminal negotiation back to it.
  if new.status = 'agreement_proposed'
     and coalesce(old.status, '') in ('held', 'complete', 'declined', 'expired', 'refunded', 'disputed') then
    raise exception 'negotiation %: cannot reopen a closed/funded negotiation (% -> agreement_proposed)', new.id, old.status
      using errcode = 'check_violation';
  end if;

  return new;
end;
$function$;
