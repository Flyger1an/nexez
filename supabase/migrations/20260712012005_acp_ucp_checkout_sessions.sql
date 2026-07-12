-- Agentic-commerce protocol support (SF3): the persisted checkout-session snapshot
-- both the OpenAI ACP and Google UCP adapters rehydrate across create->update->
-- complete, plus the checkout_orders changes needed to record an order that settles
-- via a PaymentIntent (delegated payment token) rather than a hosted Checkout Session.
--
-- Two independent parts:
--   1. checkout_orders: a `channel` discriminator + the ability to persist a
--      PaymentIntent-created order (which has NO Stripe Checkout Session id).
--   2. checkout_sessions: the short-lived, GC-able session snapshot (the durable
--      money record stays in checkout_orders, linked by stripe_payment_intent_id).
--
-- Forward-only, additive, idempotent.

-- ---------------------------------------------------------------------------
-- 1. checkout_orders: channel + PaymentIntent-native orders
-- ---------------------------------------------------------------------------

-- Which surface produced the sale. NULL on pre-existing rows (legacy direct
-- checkout); the webhook now stamps 'agent_checkout' on hosted-Checkout sales and
-- 'acp'/'ucp' on protocol sales, for finance attribution.
alter table public.checkout_orders
  add column if not exists channel text
    check (channel is null or channel in ('agent_checkout', 'acp', 'ucp'));

-- A protocol order settles by confirming a PaymentIntent on the seller's connected
-- account (SF2) - there is no Checkout Session, so stripe_session_id must be
-- optional. Existing hosted-Checkout orders keep their real session id (still
-- UNIQUE; Postgres treats NULLs as distinct so many PI-only orders coexist).
alter table public.checkout_orders
  alter column stripe_session_id drop not null;

-- Give the PaymentIntent branch a UNIQUE conflict target so a redelivered
-- payment_intent.succeeded upserts the same row instead of inserting a duplicate
-- (the event ledger already dedupes by event id; this is DB-level belt-and-braces).
-- Replaces the old NON-unique partial index on the same column.
--
-- MUST be a FULL (non-partial) unique index: the webhook upserts with
-- `ON CONFLICT (stripe_payment_intent_id)`, and Postgres can only infer a
-- non-partial index as the conflict arbiter (a partial index -> 42P10 "no unique or
-- exclusion constraint matching the ON CONFLICT specification", so every PI order
-- would 500). The default NULLS DISTINCT still lets the many null-PI hosted-checkout
-- rows coexist (same shape as the checkout_orders_stripe_session_id_key index).
drop index if exists public.checkout_orders_payment_intent_idx;
create unique index if not exists checkout_orders_payment_intent_uidx
  on public.checkout_orders (stripe_payment_intent_id);

-- ---------------------------------------------------------------------------
-- 2. checkout_sessions: the persisted protocol-session snapshot
-- ---------------------------------------------------------------------------

-- One channel-discriminated table (not two per-protocol tables): CheckoutSession is
-- already provider-neutral, so the adapters store the same snapshot and differ only
-- in wire format. line_items/buyer/totals are jsonb snapshots of the pure core's
-- resolved types (tiny digital/service carts, no cross-row queries -> no normalized
-- child table). SERVICE-ROLE ONLY: the caller is an out-of-band Bearer/HMAC agent,
-- not a Supabase-authed user, and the durable record owners read is checkout_orders.
create table if not exists public.checkout_sessions (
  id                       uuid primary key default gen_random_uuid(),
  channel                  text not null check (channel in ('acp', 'ucp')),
  page_id                  uuid not null references public.pages (id) on delete cascade,
  slug                     text not null,
  owner_id                 uuid references auth.users (id) on delete cascade,
  status                   text not null default 'pending'
    check (status in ('pending', 'ready', 'completed', 'canceled', 'expired')),
  currency                 text not null,
  line_items               jsonb not null default '[]'::jsonb,
  buyer                    jsonb,
  totals                   jsonb not null default '{}'::jsonb,
  idempotency_key          text,
  stripe_payment_intent_id text,
  api_version              text,
  expires_at               timestamptz not null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

comment on table public.checkout_sessions is
  'Persisted ACP/UCP checkout-session snapshot (create->update->complete). Short-lived + GC-able; the durable order is checkout_orders. Service-role only.';

-- Create-time idempotency: a redelivered create with the same inbound Idempotency-Key
-- returns the original session instead of minting a second (per channel).
create unique index if not exists checkout_sessions_idem_uidx
  on public.checkout_sessions (channel, idempotency_key)
  where idempotency_key is not null;

create index if not exists checkout_sessions_owner_idx on public.checkout_sessions (owner_id);
create index if not exists checkout_sessions_page_idx on public.checkout_sessions (page_id);
create index if not exists checkout_sessions_expires_idx on public.checkout_sessions (expires_at);
create index if not exists checkout_sessions_pi_idx
  on public.checkout_sessions (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

alter table public.checkout_sessions enable row level security;

-- No RLS policies: RLS on with no policy => anon/authenticated get zero rows even if
-- a grant slipped through. Belt-and-suspenders: revoke the table grants from the
-- browser roles so only the service role touches it (mirrors shopify_installs).
revoke all on public.checkout_sessions from anon, authenticated;

-- Keep updated_at fresh on every write (house pattern: pinned search_path plpgsql fn).
create or replace function public.set_checkout_sessions_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;
alter function public.set_checkout_sessions_updated_at() set search_path = '';

drop trigger if exists set_checkout_sessions_updated_at on public.checkout_sessions;
create trigger set_checkout_sessions_updated_at
  before update on public.checkout_sessions
  for each row
  execute function public.set_checkout_sessions_updated_at();
