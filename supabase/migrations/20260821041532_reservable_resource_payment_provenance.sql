alter table public.resource_holds
  add column amount_cents bigint check (amount_cents is null or amount_cents > 0),
  add column currency text check (currency is null or currency ~ '^[a-z]{3}$'),
  add constraint resource_holds_payment_economics_check
    check (status not in ('payment_pending', 'committed') or (amount_cents is not null and currency is not null));

comment on column public.resource_holds.amount_cents is
  'Exact approved smallest-unit amount bound when the matching Stripe Checkout session attaches.';
comment on column public.resource_holds.currency is
  'Exact normalized settlement currency bound when the matching Stripe Checkout session attaches.';

drop function public.attach_resource_hold_payment(uuid, text, text, text, text);

create function public.attach_resource_hold_payment(
  p_hold_id uuid,
  p_transaction_fingerprint text,
  p_allocation_fingerprint text,
  p_stripe_checkout_session_id text,
  p_stripe_connect_account_id text,
  p_amount_cents bigint,
  p_currency text
)
returns timestamptz
language plpgsql
set search_path = ''
as $$
declare
  hold public.resource_holds%rowtype;
begin
  if p_amount_cents is null or p_amount_cents <= 0 or p_currency !~ '^[a-z]{3}$' then
    raise exception 'resource payment economics are invalid' using errcode = '22023';
  end if;
  select * into hold from public.resource_holds where id = p_hold_id for update;
  if hold.id is null then raise exception 'resource hold not found' using errcode = 'P0002'; end if;
  if hold.status = 'payment_pending'
    and hold.stripe_checkout_session_id = p_stripe_checkout_session_id
    and hold.stripe_connect_account_id = p_stripe_connect_account_id
    and hold.amount_cents = p_amount_cents
    and hold.currency = p_currency then
    return hold.expires_at;
  end if;
  if hold.status <> 'active' or hold.expires_at <= now()
    or hold.transaction_fingerprint <> p_transaction_fingerprint
    or hold.allocation_fingerprint <> p_allocation_fingerprint then
    raise exception 'resource hold is expired, changed, or unavailable for payment' using errcode = 'P0001';
  end if;
  update public.resource_holds
  set status = 'payment_pending',
      stripe_checkout_session_id = p_stripe_checkout_session_id,
      stripe_connect_account_id = p_stripe_connect_account_id,
      amount_cents = p_amount_cents,
      currency = p_currency,
      updated_at = now()
  where id = hold.id;
  insert into public.resource_allocation_events (hold_id, event_type, idempotency_key, metadata)
  values (
    hold.id,
    'payment_attached',
    p_stripe_checkout_session_id,
    jsonb_build_object('expiresAt', hold.expires_at, 'amountCents', p_amount_cents, 'currency', p_currency)
  );
  return hold.expires_at;
end;
$$;

revoke all on function public.attach_resource_hold_payment(uuid, text, text, text, text, bigint, text)
  from public, anon, authenticated;
grant execute on function public.attach_resource_hold_payment(uuid, text, text, text, text, bigint, text)
  to service_role;
