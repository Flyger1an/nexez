-- Freeze what the buyer authorized on an ACP/UCP checkout session.
--
-- Both protocol /complete routes re-price the session against live offers
-- immediately before charging (updateSession with `items` omitted). Until now the
-- re-priced total WAS the charged amount, so a merchant editing their price between
-- quote and completion settled at the new number under the old authorization. The
-- session snapshot carried no record of what was actually agreed to, so there was
-- nothing to compare the re-price against.
--
-- These three columns are that record. They are written once, when the session first
-- becomes payable (`ready`), and are re-frozen only when an agent deliberately
-- supplies a new cart. `checkApprovalDrift` compares the re-priced session against
-- them at settlement: equal or cheaper settles, dearer/different-currency/
-- different-cart refuses and demands re-confirmation.
--
-- APPLIED to production via MCP as migration 20260817054006 ahead of this commit;
-- this file mirrors it into source so the schema history does not drift.
--
-- DEPLOY ORDER: this migration must land BEFORE the code that reads it. The session
-- store writes all three columns on every insert and update, so application code
-- shipped against a database without them fails every session create with PGRST204.
-- This direction is safe: the columns are additive and nullable, and code that has
-- not shipped yet never touches them.
--
-- Forward-only, additive, idempotent. Nullable on purpose: rows created before this
-- migration have no authorization on file and are allowed through, which is safe
-- because sessions expire well inside one deploy cycle (defaultSessionExpiry is 45
-- minutes) and failing them closed would strand every in-flight checkout.

alter table public.checkout_sessions
  add column if not exists approved_amount_cents integer,
  add column if not exists approved_currency text,
  add column if not exists approved_cart_fingerprint text;

comment on column public.checkout_sessions.approved_amount_cents is
  'Buyer-authorized total in the currency''s smallest unit, frozen at the first `ready`. Settlement refuses any re-priced total above this. NULL only for rows predating the column.';
comment on column public.checkout_sessions.approved_currency is
  'Currency the authorization was given in. A change between quote and completion refuses settlement.';
comment on column public.checkout_sessions.approved_cart_fingerprint is
  'Order-independent identifier for the authorized cart COMPOSITION (offer keys + quantities, never prices, so a price drop still settles). Non-cryptographic equality token produced by cartFingerprint(); never accepted from a caller.';
