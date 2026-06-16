-- Direct-checkout ORDER records (dispute/refund review gap #2). The /api/checkout
-- flow charged the seller's connected account but persisted only a fire-and-forget
-- `checkout_events` log row (no payment_intent, no charge) — so a direct sale had
-- NO in-app refund and a dispute on it hit the webhook's negotiation-only matcher
-- and was silently dropped. This table is the durable order record: the webhook
-- captures it on checkout.session.completed (with the PI), the refund route refunds
-- it, and the reversal handler matches disputes/refunds to it by payment intent.
--
-- Writes are SERVICE-ROLE only (webhook + refund route, which re-checks ownership)
-- — owners get SELECT on their own rows, mirroring billing_subscriptions/agent_negotiations.

create table if not exists public.checkout_orders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  page_id uuid references public.pages(id) on delete set null,
  slug text,
  offer_name text,
  offer_key text,
  stripe_session_id text not null unique,
  stripe_payment_intent_id text,
  stripe_connect_account_id text,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'usd',
  application_fee_cents integer,
  status text not null default 'paid' check (status in ('paid', 'refunded', 'disputed', 'dispute_won')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists checkout_orders_owner_created_idx on public.checkout_orders (owner_id, created_at desc);
create index if not exists checkout_orders_payment_intent_idx on public.checkout_orders (stripe_payment_intent_id) where stripe_payment_intent_id is not null;

alter table public.checkout_orders enable row level security;

-- Owners may READ their own orders; all writes go through the service-role client.
-- Strip Supabase's default-privilege grants first (new public tables get ALL granted
-- to anon+authenticated by default) so the only grant is authenticated SELECT, which
-- the owner-read policy below then gates. Defense-in-depth vs. the H1 grant+policy class.
revoke all on public.checkout_orders from anon;
revoke all on public.checkout_orders from authenticated;
grant select on public.checkout_orders to authenticated;

drop policy if exists "Owners can read own orders" on public.checkout_orders;
create policy "Owners can read own orders"
  on public.checkout_orders
  for select
  to authenticated
  using ((select auth.uid()) = owner_id);
