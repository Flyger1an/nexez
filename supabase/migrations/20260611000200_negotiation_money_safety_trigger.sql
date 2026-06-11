-- Burst 1: money-safety invariants enforced at the database, independent of which
-- client issues the UPDATE (defense-in-depth vs direct REST writes by the owner).
--
-- Only two illegal moves are blocked; everything else (LLM decisions, resume from
-- declined, offline complete without a payment) stays permitted:
--   1. status -> 'held' requires a payment intent on the row (no fake holds).
--   2. status -> 'complete' on a payment-backed negotiation requires it to have
--      passed through 'held' (escrow capture) UNLESS it's an autonomous 'auto'
--      settlement (immediate capture). Offline completes (no PI) are allowed.
-- Idempotent.

create or replace function public.nz_negotiation_money_safety()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'held' and new.stripe_payment_intent_id is null then
    raise exception 'negotiation %: cannot set held without a payment intent', new.id
      using errcode = 'check_violation';
  end if;

  if new.status = 'complete'
     and new.stripe_payment_intent_id is not null
     and coalesce(old.status, '') <> 'held'
     and coalesce(new.settlement_state, '') <> 'auto' then
    raise exception 'negotiation %: cannot complete a payment-backed negotiation without a captured hold', new.id
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists nz_negotiation_money_safety on public.agent_negotiations;
create trigger nz_negotiation_money_safety
  before update on public.agent_negotiations
  for each row execute function public.nz_negotiation_money_safety();
