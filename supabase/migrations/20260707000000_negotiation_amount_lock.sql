-- R5 deferred item (1): lock agent_negotiations.amount_cents once funding is
-- attached. The app layer (transition/route.ts) already refuses amount edits
-- outside the pre-funding states, but RLS lets an owner write their OWN rows
-- directly via PostgREST, so a held/funded amount could be edited around the
-- app guard. This adds the DB-layer lock (defense-in-depth, independent of the
-- client), matching how the money-safety trigger guards held/complete already.
--
-- Forward-only on UPDATE (OLD vs NEW), so the 23 existing funded rows are
-- unaffected until someone tries to change a funded amount. Refunds use the
-- refunded_cents ledger (not amount_cents) and capture/complete never touch
-- amount_cents, so no legitimate flow trips this.
--
-- Extends the LIVE nz_negotiation_money_safety definition (which carries the
-- reopen guard + disputed-complete allowance beyond the original migration
-- file); idempotent (create or replace).

create or replace function public.nz_negotiation_money_safety()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
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

  -- Reopen guard: agreement_proposed may only be reached from an active
  -- negotiating state. Never reverse a funded/terminal negotiation back to it.
  if new.status = 'agreement_proposed'
     and coalesce(old.status, '') in ('held', 'complete', 'declined', 'expired', 'refunded', 'disputed') then
    raise exception 'negotiation %: cannot reopen a closed/funded negotiation (% -> agreement_proposed)', new.id, old.status
      using errcode = 'check_violation';
  end if;

  -- Amount lock: once a PaymentIntent is attached (funded), the agreed amount
  -- is immutable. Pre-funding edits (old PI null) stay open for renegotiation;
  -- `is distinct from` lets no-op updates (status flip, updated_at touch that
  -- carry the same amount) pass untouched.
  if old.stripe_payment_intent_id is not null
     and new.amount_cents is distinct from old.amount_cents then
    raise exception 'negotiation %: amount_cents is locked once funding is attached', new.id
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists nz_negotiation_money_safety on public.agent_negotiations;
create trigger nz_negotiation_money_safety
  before update on public.agent_negotiations
  for each row execute function public.nz_negotiation_money_safety();
