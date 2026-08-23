-- Defense-in-depth: lock down direct client writes to the billing_subscriptions MONEY table.
--
-- Today the ONLY thing stopping an anon/authenticated client from writing this table is the
-- ABSENCE of an RLS write policy (RLS is enabled with a single SELECT-only owner policy).
-- The table still carries broad INSERT/UPDATE/DELETE grants to anon + authenticated. That is
-- a latent hole: an accidental future permissive write policy - or an RLS toggle - would
-- immediately expose plan/status/commission tampering by any signed-in user against their own
-- row (raise their plan, un-pause, drop commission).
--
-- Mirror the pages_public hardening: REVOKE all write privileges from anon + authenticated so
-- the grant is a second, independent lock. Every legitimate write already goes through the
-- service-role client (start-trial, create-subscription, billing/connect, the Stripe webhook,
-- sync-checkout-session, and the reconcile crons). Owners keep SELECT (read their own row via
-- the RLS policy); service_role is untouched.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.billing_subscriptions
  FROM anon, authenticated;
