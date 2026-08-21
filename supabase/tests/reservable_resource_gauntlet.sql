-- Live-schema reservable-resource certification. All fixtures roll back.

begin;
set local statement_timeout = '30s';
set local lock_timeout = '5s';

create temporary table resource_gauntlet_results (
  sequence bigint generated always as identity,
  scenario text not null,
  passed boolean not null,
  detail text not null
) on commit drop;

create temporary table resource_gauntlet_owner (
  id uuid primary key
) on commit drop;

do $gauntlet$
declare
  v_suffix text := replace(gen_random_uuid()::text, '-', '');
  v_owner uuid := gen_random_uuid();
  v_page uuid := gen_random_uuid();
  v_consumable uuid := gen_random_uuid();
  v_reusable uuid := gen_random_uuid();
  v_window uuid := gen_random_uuid();
  v_abuse_pool uuid := gen_random_uuid();
  v_first uuid;
  v_second uuid;
  v_replay uuid;
  v_reservation uuid;
  v_guarded boolean;
  v_allocations jsonb;
begin
  insert into resource_gauntlet_owner (id) values (v_owner);
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values (
    '00000000-0000-0000-0000-000000000000', v_owner, 'authenticated', 'authenticated',
    'resource-' || v_suffix || '@example.test', '', now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now()
  );
  insert into public.pages (id, owner_id, name, slug, is_published)
  values (v_page, v_owner, 'Resource gauntlet', 'resource-' || v_suffix, true);
  insert into public.resource_pools (
    id, owner_id, page_id, resource_key, label, unit_label, kind, total_quantity
  ) values
    (v_consumable, v_owner, v_page, 'dinner-kits', 'Dinner kits', 'kits', 'consumable', 2),
    (v_reusable, v_owner, v_page, 'guest-capacity', 'Guest capacity', 'guests', 'reusable', 5),
    (v_abuse_pool, v_owner, v_page, 'abuse-capacity', 'Abuse capacity', 'units', 'consumable', 10);
  insert into public.resource_pool_windows (
    id, pool_id, window_key, label, starts_at, ends_at, total_quantity
  ) values (
    v_window, v_reusable, 'dinner-window', 'Dinner window',
    now() + interval '2 days', now() + interval '2 days 4 hours', 5
  );

  v_allocations := jsonb_build_array(
    jsonb_build_object('poolId', v_consumable, 'poolVersion', 1, 'quantity', 2),
    jsonb_build_object('poolId', v_reusable, 'poolVersion', 1, 'windowId', v_window, 'windowVersion', 1, 'quantity', 4)
  );
  v_first := public.acquire_resource_hold(
    v_owner, v_page, 'services:0', repeat('1', 64), repeat('a', 64),
    repeat('b', 64), repeat('c', 64), v_allocations, 1800
  );
  v_replay := public.acquire_resource_hold(
    v_owner, v_page, 'services:0', repeat('1', 64), repeat('a', 64),
    repeat('b', 64), repeat('c', 64), v_allocations, 1800
  );
  insert into resource_gauntlet_results (scenario, passed, detail)
  values (
    'atomic multi-pool hold is idempotent',
    v_first = v_replay and (select count(*) = 2 from public.resource_hold_allocations where hold_id = v_first),
    'One scoped key must return one all-or-none two-pool hold.'
  );

  v_guarded := false;
  begin
    perform public.acquire_resource_hold(
      v_owner, v_page, 'services:0', repeat('2', 64), repeat('d', 64),
      repeat('e', 64), repeat('f', 64),
      jsonb_build_array(jsonb_build_object('poolId', v_consumable, 'poolVersion', 1, 'quantity', 1)),
      1800
    );
  exception when raise_exception then
    v_guarded := true;
  end;
  insert into resource_gauntlet_results (scenario, passed, detail)
  values ('oversubscription fails closed', v_guarded, 'The final consumable unit cannot be sold twice.');

  perform public.release_resource_hold(v_first, 'buyer_cancelled', null);
  v_second := public.acquire_resource_hold(
    v_owner, v_page, 'services:0', repeat('2', 64), repeat('d', 64),
    repeat('e', 64), repeat('f', 64),
    jsonb_build_array(jsonb_build_object('poolId', v_consumable, 'poolVersion', 1, 'quantity', 1)),
    1800
  );
  perform public.attach_resource_hold_payment(
    v_second, repeat('e', 64), repeat('f', 64), 'cs_resource_test', 'acct_resource_test', 10000, 'usd'
  );

  v_guarded := false;
  begin
    perform public.release_resource_hold(v_second, 'unattached_expiry', null);
  exception when raise_exception then
    v_guarded := true;
  end;
  insert into resource_gauntlet_results (scenario, passed, detail)
  values (
    'payment-pending hold ignores wall-clock release',
    v_guarded and (select status = 'payment_pending' from public.resource_holds where id = v_second),
    'Only a matching provider terminal result may release an attached payment.'
  );

  update public.resource_holds
  set created_at = now() - interval '2 hours', expires_at = now() - interval '1 hour'
  where id = v_second;
  v_reservation := public.commit_resource_hold(
    v_second, repeat('e', 64), repeat('f', 64), 'cs_resource_test', 'acct_resource_test',
    'pi_resource_test', 'evt_resource_test'
  );
  v_replay := public.commit_resource_hold(
    v_second, repeat('e', 64), repeat('f', 64), 'cs_resource_test', 'acct_resource_test',
    'pi_resource_test', 'evt_resource_test'
  );
  insert into resource_gauntlet_results (scenario, passed, detail)
  values (
    'delayed authoritative webhook commits exactly once',
    v_reservation = v_replay
      and (select status = 'committed' from public.resource_holds where id = v_second)
      and (select count(*) = 1 from public.resource_reservations where hold_id = v_second),
    'A matching paid event remains authoritative after the shared session deadline.'
  );

  v_guarded := false;
  begin
    update public.resource_pools set total_quantity = 0 where id = v_consumable;
  exception when check_violation then
    v_guarded := true;
  end;
  insert into resource_gauntlet_results (scenario, passed, detail)
  values ('merchant cannot shrink below commitments', v_guarded, 'Committed physical availability cannot be rewritten away.');

  perform public.acquire_resource_hold(v_owner, v_page, 'services:1', repeat('9', 64), repeat('1', 64), repeat('1', 64), repeat('1', 64), jsonb_build_array(jsonb_build_object('poolId', v_abuse_pool, 'poolVersion', 1, 'quantity', 1)), 1800);
  perform public.acquire_resource_hold(v_owner, v_page, 'services:1', repeat('9', 64), repeat('2', 64), repeat('2', 64), repeat('2', 64), jsonb_build_array(jsonb_build_object('poolId', v_abuse_pool, 'poolVersion', 1, 'quantity', 1)), 1800);
  perform public.acquire_resource_hold(v_owner, v_page, 'services:1', repeat('9', 64), repeat('3', 64), repeat('3', 64), repeat('3', 64), jsonb_build_array(jsonb_build_object('poolId', v_abuse_pool, 'poolVersion', 1, 'quantity', 1)), 1800);
  v_guarded := false;
  begin
    perform public.acquire_resource_hold(v_owner, v_page, 'services:1', repeat('9', 64), repeat('4', 64), repeat('4', 64), repeat('4', 64), jsonb_build_array(jsonb_build_object('poolId', v_abuse_pool, 'poolVersion', 1, 'quantity', 1)), 1800);
  exception when raise_exception then
    v_guarded := true;
  end;
  insert into resource_gauntlet_results (scenario, passed, detail)
  values ('rotating keys cannot squat inventory', v_guarded, 'One buyer/offer may hold at most three concurrent allocations.');
end
$gauntlet$;

select scenario, passed, detail from resource_gauntlet_results order by sequence;

do $assertions$
begin
  if exists (select 1 from resource_gauntlet_results where not passed) then
    raise exception 'reservable-resource gauntlet failed';
  end if;
end
$assertions$;

-- A committed allocation is immutable during ordinary merchant authoring, but
-- deleting the owning auth account must remove its private commerce data rather
-- than fail on restrictive child-ledger foreign keys.
delete from auth.users
where id in (select id from resource_gauntlet_owner);

do $account_deletion$
begin
  if exists (
    select 1
    from public.resource_holds hold
    where hold.owner_id in (select id from resource_gauntlet_owner)
  ) then
    raise exception 'resource account deletion did not cascade';
  end if;
end
$account_deletion$;

rollback;
