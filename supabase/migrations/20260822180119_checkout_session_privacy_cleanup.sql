-- Protocol checkout sessions are short-lived quote snapshots, not the durable
-- transaction ledger. Remove their buyer identity when the quote expires, then
-- delete only incomplete rows that have no payment lineage. Completed or
-- payment-linked sessions remain available for reconciliation without retaining
-- the duplicated buyer identity JSON.

create or replace function private.nz_cleanup_expired_checkout_sessions(
  p_batch_size integer default 1000
)
returns table (scrubbed_count integer, deleted_count integer)
language plpgsql
set search_path = ''
as $$
declare
  v_scrubbed integer := 0;
  v_deleted integer := 0;
begin
  if p_batch_size < 1 or p_batch_size > 10000 then
    raise exception 'p_batch_size must be between 1 and 10000';
  end if;

  with candidates as (
    select session.id
    from public.checkout_sessions as session
    where session.expires_at <= now()
      and jsonb_typeof(session.buyer) = 'object'
      and session.buyer ?| array['email', 'name', 'reference', 'agent']
    order by session.expires_at, session.id
    limit p_batch_size
    for update skip locked
  )
  update public.checkout_sessions as session
  set buyer = nullif(
    session.buyer - array['email', 'name', 'reference', 'agent']::text[],
    '{}'::jsonb
  )
  from candidates
  where session.id = candidates.id;
  get diagnostics v_scrubbed = row_count;

  with candidates as (
    select session.id
    from public.checkout_sessions as session
    where session.expires_at <= now()
      and session.status in ('pending', 'ready', 'canceled', 'expired')
      and session.stripe_payment_intent_id is null
      and not exists (
        select 1
        from public.checkout_orders as order_record
        where order_record.stripe_payment_intent_id is not null
          and order_record.stripe_payment_intent_id = session.stripe_payment_intent_id
      )
      and not exists (
        select 1
        from public.staged_settlement_obligations as obligation
        where (
          obligation.stripe_payment_intent_id is not null
          and obligation.stripe_payment_intent_id = session.stripe_payment_intent_id
        ) or obligation.stripe_checkout_session_id = session.id::text
      )
    order by session.expires_at, session.id
    limit p_batch_size
    for update skip locked
  )
  delete from public.checkout_sessions as session
  using candidates
  where session.id = candidates.id;
  get diagnostics v_deleted = row_count;

  return query select v_scrubbed, v_deleted;
end;
$$;

comment on function private.nz_cleanup_expired_checkout_sessions(integer) is
  'Scrubs identity from expired protocol checkout snapshots and deletes only incomplete, payment-unlinked rows in bounded batches.';

revoke all on function private.nz_cleanup_expired_checkout_sessions(integer)
  from public, anon, authenticated, service_role;

do $cleanup_schedule$
declare
  existing_job bigint;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    for existing_job in
      select jobid from cron.job where jobname = 'nexez_cleanup_expired_checkout_sessions'
    loop
      perform cron.unschedule(existing_job);
    end loop;

    perform cron.schedule(
      'nexez_cleanup_expired_checkout_sessions',
      '41 * * * *',
      $command$select * from private.nz_cleanup_expired_checkout_sessions(1000)$command$
    );
  end if;
end
$cleanup_schedule$;
