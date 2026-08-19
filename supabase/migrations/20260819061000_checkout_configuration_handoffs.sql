-- Buyer-selected offer configuration must survive the hosted Stripe hop without
-- turning Stripe metadata or public checkout telemetry into the fulfillment
-- database. /api/checkout writes one service-role-only handoff row keyed by the
-- Stripe Checkout Session id. The existing checkout_orders webhook write stays
-- unchanged; these triggers merge the trusted snapshot into order metadata and
-- consume the handoff atomically in the same transaction.

create table if not exists public.checkout_configuration_handoffs (
  stripe_session_id text primary key,
  page_id uuid references public.pages(id) on delete set null,
  offer_key text not null check (char_length(offer_key) between 1 and 160),
  configuration jsonb not null
    check (
      jsonb_typeof(configuration) = 'object'
      and octet_length(configuration::text) <= 65536
    ),
  configuration_fingerprint text not null
    check (configuration_fingerprint ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.checkout_configuration_handoffs is
  'Private pre-payment snapshots of normalized buyer offer configuration, consumed when checkout_orders persists the paid Stripe session.';
comment on column public.checkout_configuration_handoffs.configuration is
  'Exact normalized buyer values validated against the merchant-authored offer schema at checkout time.';
comment on column public.checkout_configuration_handoffs.configuration_fingerprint is
  'SHA-256 fingerprint of the normalized configured checkout action.';

alter table public.checkout_configuration_handoffs enable row level security;

-- No client policy by design. Only trusted server/service-role code may create or
-- inspect fulfillment handoffs. Explicit privilege revocation is defense in depth
-- against future default-grant changes.
revoke all on public.checkout_configuration_handoffs from anon;
revoke all on public.checkout_configuration_handoffs from authenticated;
grant select, insert, update, delete on public.checkout_configuration_handoffs to service_role;

create or replace function public.apply_checkout_configuration_handoff()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  handoff public.checkout_configuration_handoffs%rowtype;
begin
  if new.stripe_session_id is null then
    return new;
  end if;

  select *
    into handoff
    from public.checkout_configuration_handoffs
   where stripe_session_id = new.stripe_session_id
     and offer_key = new.offer_key
     and (page_id is null or new.page_id is not distinct from page_id)
   for update;

  if found then
    new.metadata := coalesce(new.metadata, '{}'::jsonb) || jsonb_build_object(
      'offer_configuration', handoff.configuration,
      'offer_configuration_fingerprint', handoff.configuration_fingerprint,
      'offer_configuration_schema_version', 1
    );
  end if;

  return new;
end;
$$;

-- Split merge (BEFORE) from consume (AFTER). PostgreSQL fires BEFORE INSERT even
-- when INSERT ... ON CONFLICT later becomes an UPDATE. Keeping the handoff until
-- AFTER the final row operation lets both the insert and conflict-update paths see
-- the same snapshot, while transaction rollback restores the handoff automatically.
create or replace function public.consume_checkout_configuration_handoff()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.stripe_session_id is null then
    return null;
  end if;

  delete from public.checkout_configuration_handoffs
   where stripe_session_id = new.stripe_session_id
     and configuration_fingerprint = new.metadata ->> 'offer_configuration_fingerprint';

  return null;
end;
$$;

drop trigger if exists checkout_orders_apply_configuration_handoff on public.checkout_orders;
create trigger checkout_orders_apply_configuration_handoff
before insert or update on public.checkout_orders
for each row
execute function public.apply_checkout_configuration_handoff();

drop trigger if exists checkout_orders_consume_configuration_handoff on public.checkout_orders;
create trigger checkout_orders_consume_configuration_handoff
after insert or update on public.checkout_orders
for each row
execute function public.consume_checkout_configuration_handoff();
