-- Defense-in-depth DB constraints on the negotiation money columns (launch audit
-- §Low). The app enforces these, but a direct/buggy write shouldn't be able to
-- store a non-positive agreed amount or attach the same PaymentIntent to two
-- negotiations. Verified against prod first: 0 non-positive amounts, 0 duplicate
-- payment_intents — so these apply cleanly. Idempotent + additive.

-- A stored agreed amount must be positive (NULL = not yet agreed, allowed).
alter table public.agent_negotiations
  drop constraint if exists agent_negotiations_amount_cents_positive;
alter table public.agent_negotiations
  add constraint agent_negotiations_amount_cents_positive
  check (amount_cents is null or amount_cents > 0);

-- One PaymentIntent maps to at most one negotiation (complements the money-safety
-- trigger, which checks PI *presence* for `held`, not *uniqueness*). Partial so the
-- many not-yet-funded rows (NULL PI) are unconstrained.
create unique index if not exists agent_negotiations_payment_intent_uniq
  on public.agent_negotiations (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;
