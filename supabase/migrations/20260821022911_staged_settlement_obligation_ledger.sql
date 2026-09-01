-- Finite staged settlement is an agreement parent with ordered payment
-- obligations. Every obligation is one immediate-capture Stripe payment; the
-- agreement never saves a card or authorizes a later autonomous charge.

create table public.staged_settlement_agreements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  page_id uuid references public.pages(id) on delete set null,
  slug text,
  offer_key text not null check (char_length(offer_key) between 1 and 160),
  offer_name text not null check (char_length(offer_name) between 1 and 240),
  status text not null default 'pending'
    check (status in ('pending', 'active', 'complete', 'cancelled', 'disputed')),
  contract_snapshot jsonb not null
    check (jsonb_typeof(contract_snapshot) = 'object' and octet_length(contract_snapshot::text) <= 131072),
  contract_fingerprint text not null check (contract_fingerprint ~ '^[a-f0-9]{64}$'),
  total_amount_cents bigint not null check (total_amount_cents > 0),
  currency text not null check (currency ~ '^[a-z]{3}$'),
  stripe_connect_account_id text not null,
  request_idempotency_key text,
  commission_bps integer check (commission_bps is null or commission_bps between 0 and 1000),
  plan_id_at_purchase text
    check (plan_id_at_purchase is null or plan_id_at_purchase in ('free', 'launch', 'pro', 'scale', 'enterprise')),
  commission_source text
    check (commission_source is null or commission_source in ('plan_default', 'enterprise_override', 'promotion')),
  buyer_email text,
  buyer_name text,
  buyer_reference text,
  buyer_agent text,
  access_token_sha256 text not null check (access_token_sha256 ~ '^[a-f0-9]{64}$'),
  access_token_encrypted text not null,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'complete') = (completed_at is not null)),
  check (status <> 'cancelled' or cancelled_at is not null)
);

create unique index staged_settlement_agreements_access_token_uidx
  on public.staged_settlement_agreements (access_token_sha256);
create unique index staged_settlement_agreements_request_idempotency_uidx
  on public.staged_settlement_agreements (owner_id, request_idempotency_key)
  where request_idempotency_key is not null;
create index staged_settlement_agreements_owner_created_idx
  on public.staged_settlement_agreements (owner_id, created_at desc);

comment on table public.staged_settlement_agreements is
  'Immutable-after-first-payment parent contract for a finite buyer-approved payment schedule.';
comment on column public.staged_settlement_agreements.contract_snapshot is
  'Exact resolved schedule, authoritative total/currency, buyer configuration, pricing, and fulfillment provenance.';
comment on column public.staged_settlement_agreements.contract_fingerprint is
  'SHA-256 action fingerprint bound into every obligation approval and Stripe session.';

alter table public.staged_settlement_agreements enable row level security;
revoke all on public.staged_settlement_agreements from anon;
revoke all on public.staged_settlement_agreements from authenticated;
grant select on public.staged_settlement_agreements to authenticated;
grant select, insert, update, delete on public.staged_settlement_agreements to service_role;

create policy staged_settlement_agreements_owner_select
  on public.staged_settlement_agreements
  for select
  to authenticated
  using ((select auth.uid()) = owner_id);

create table public.staged_settlement_obligations (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid not null references public.staged_settlement_agreements(id) on delete cascade,
  stage_id text not null check (stage_id ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  stage_order integer not null check (stage_order between 1 and 5),
  label text not null check (char_length(label) between 1 and 120 and label !~ '[<>]'),
  kind text not null check (kind in ('commitment', 'milestone', 'completion')),
  allocation_bps integer not null check (allocation_bps between 1 and 9999),
  amount_cents bigint not null check (amount_cents > 0),
  status text not null default 'pending'
    check (status in ('pending', 'ready_for_buyer_approval', 'payment_pending', 'paid', 'refunded', 'disputed', 'cancelled')),
  approval_fingerprint text check (approval_fingerprint is null or approval_fingerprint ~ '^[a-f0-9]{64}$'),
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text unique,
  stripe_livemode boolean,
  application_fee_cents bigint check (application_fee_cents is null or application_fee_cents >= 0),
  paid_at timestamptz,
  refunded_at timestamptz,
  disputed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agreement_id, stage_id),
  unique (agreement_id, stage_order),
  check (status <> 'payment_pending' or approval_fingerprint is not null),
  check (
    status <> 'paid'
    or (
      stripe_checkout_session_id is not null
      and stripe_payment_intent_id is not null
      and stripe_livemode is not null
      and paid_at is not null
    )
  ),
  check (status <> 'refunded' or refunded_at is not null),
  check (status <> 'disputed' or disputed_at is not null)
);

create unique index staged_settlement_one_payable_obligation_uidx
  on public.staged_settlement_obligations (agreement_id)
  where status in ('ready_for_buyer_approval', 'payment_pending');
create index staged_settlement_obligations_agreement_order_idx
  on public.staged_settlement_obligations (agreement_id, stage_order);
create index staged_settlement_obligations_payment_intent_idx
  on public.staged_settlement_obligations (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

comment on table public.staged_settlement_obligations is
  'Ordered, single-payment obligations under one staged settlement agreement. Only one obligation may be buyer-payable at a time.';
comment on column public.staged_settlement_obligations.approval_fingerprint is
  'Fingerprint of the exact agreement, obligation, amount, currency, and paid-predecessor lineage approved for this payment attempt.';

alter table public.staged_settlement_obligations enable row level security;
revoke all on public.staged_settlement_obligations from anon;
revoke all on public.staged_settlement_obligations from authenticated;
grant select on public.staged_settlement_obligations to authenticated;
grant select, insert, update, delete on public.staged_settlement_obligations to service_role;

create policy staged_settlement_obligations_owner_select
  on public.staged_settlement_obligations
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.staged_settlement_agreements agreement
      where agreement.id = agreement_id
        and agreement.owner_id = (select auth.uid())
    )
  );

create function public.enforce_staged_settlement_agreement_immutability()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.staged_settlement_obligations obligation
    where obligation.agreement_id = old.id
      and obligation.status in ('paid', 'refunded', 'disputed')
  ) and row(
    new.owner_id,
    new.page_id,
    new.slug,
    new.offer_key,
    new.offer_name,
    new.contract_snapshot,
    new.contract_fingerprint,
    new.total_amount_cents,
    new.currency,
    new.stripe_connect_account_id,
    new.commission_bps,
    new.plan_id_at_purchase,
    new.commission_source
  ) is distinct from row(
    old.owner_id,
    old.page_id,
    old.slug,
    old.offer_key,
    old.offer_name,
    old.contract_snapshot,
    old.contract_fingerprint,
    old.total_amount_cents,
    old.currency,
    old.stripe_connect_account_id,
    old.commission_bps,
    old.plan_id_at_purchase,
    old.commission_source
  ) then
    raise exception 'staged settlement contract is immutable after its first payment'
      using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger staged_settlement_agreement_immutability
before update on public.staged_settlement_agreements
for each row execute function public.enforce_staged_settlement_agreement_immutability();

create function public.enforce_staged_settlement_obligation_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if row(
    new.agreement_id,
    new.stage_id,
    new.stage_order,
    new.label,
    new.kind,
    new.allocation_bps,
    new.amount_cents
  ) is distinct from row(
    old.agreement_id,
    old.stage_id,
    old.stage_order,
    old.label,
    old.kind,
    old.allocation_bps,
    old.amount_cents
  ) then
    raise exception 'staged settlement obligation contract fields are immutable'
      using errcode = '23514';
  end if;

  if new.status is distinct from old.status and not (
    (old.status = 'pending' and new.status in ('ready_for_buyer_approval', 'cancelled'))
    or (old.status = 'ready_for_buyer_approval' and new.status in ('payment_pending', 'cancelled'))
    or (old.status = 'payment_pending' and new.status in ('ready_for_buyer_approval', 'paid', 'cancelled'))
    or (old.status = 'paid' and new.status in ('refunded', 'disputed'))
    or (old.status = 'disputed' and new.status in ('paid', 'refunded'))
  ) then
    raise exception 'invalid staged settlement obligation transition: % -> %', old.status, new.status
      using errcode = '23514';
  end if;

  if new.status = 'ready_for_buyer_approval' and exists (
    select 1
    from public.staged_settlement_obligations predecessor
    where predecessor.agreement_id = new.agreement_id
      and predecessor.stage_order < new.stage_order
      and predecessor.status <> 'paid'
  ) then
    raise exception 'all preceding staged settlement obligations must be paid first'
      using errcode = '23514';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger staged_settlement_obligation_transition
before update on public.staged_settlement_obligations
for each row execute function public.enforce_staged_settlement_obligation_transition();

create function public.refresh_staged_settlement_agreement_status()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  next_status text;
begin
  if exists (
    select 1 from public.staged_settlement_obligations
    where agreement_id = new.agreement_id and status = 'disputed'
  ) then
    next_status := 'disputed';
  elsif not exists (
    select 1 from public.staged_settlement_obligations
    where agreement_id = new.agreement_id and status <> 'paid'
  ) then
    next_status := 'complete';
  elsif exists (
    select 1 from public.staged_settlement_obligations
    where agreement_id = new.agreement_id and status in ('paid', 'refunded')
  ) then
    next_status := 'active';
  else
    next_status := 'pending';
  end if;

  update public.staged_settlement_agreements
  set status = next_status,
      completed_at = case when next_status = 'complete' then coalesce(completed_at, now()) else null end
  where id = new.agreement_id
    and status <> 'cancelled';
  return null;
end;
$$;

create trigger staged_settlement_refresh_agreement_status
after insert or update of status on public.staged_settlement_obligations
for each row execute function public.refresh_staged_settlement_agreement_status();

-- Every paid stage remains a normal checkout order so refund/dispute economics
-- keep using the existing transaction ledger.
alter table public.checkout_orders
  add column staged_settlement_agreement_id uuid
    references public.staged_settlement_agreements(id) on delete set null,
  add column staged_settlement_obligation_id uuid
    references public.staged_settlement_obligations(id) on delete set null;

create unique index checkout_orders_staged_obligation_uidx
  on public.checkout_orders (staged_settlement_obligation_id)
  where staged_settlement_obligation_id is not null;
create index checkout_orders_staged_agreement_idx
  on public.checkout_orders (staged_settlement_agreement_id, created_at desc)
  where staged_settlement_agreement_id is not null;

alter table public.checkout_orders
  add constraint checkout_orders_staged_settlement_pair_check
    check (
      (staged_settlement_agreement_id is null)
      = (staged_settlement_obligation_id is null)
    ),
  drop constraint if exists checkout_orders_channel_check,
  add constraint checkout_orders_channel_check
    check (
      channel is null
      or channel in (
        'agent_checkout',
        'acp',
        'ucp',
        'negotiation',
        'nexxi',
        'recurring_service',
        'staged_settlement'
      )
    );

comment on column public.checkout_orders.staged_settlement_agreement_id is
  'Finite staged settlement agreement funded by this order when channel=staged_settlement.';
comment on column public.checkout_orders.staged_settlement_obligation_id is
  'Exact staged obligation funded by this one Stripe payment.';
