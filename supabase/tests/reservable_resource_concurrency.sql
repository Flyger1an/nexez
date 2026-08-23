-- True two-connection race for the final unit. This uses only fixed disposable
-- fixture UUIDs, removes stale fixtures before starting, and cleans up after.

-- dblink runs inside PostgreSQL, so its connection address can differ from the
-- psql client's address when Supabase is published through Docker. Callers may
-- override this default with:
--   psql --set=resource_dblink_url='dbname=... host=... port=... user=... password=...'
\if :{?resource_dblink_url}
\else
\set resource_dblink_url 'dbname=postgres user=postgres password=postgres host=host.docker.internal port=54322'
\endif

create extension if not exists dblink with schema extensions;

delete from public.resource_allocation_events where hold_id in (
  select id from public.resource_holds where owner_id = '90909090-9090-4090-8090-909090909090'
);
delete from public.resource_reservations where owner_id = '90909090-9090-4090-8090-909090909090';
delete from public.resource_hold_allocations where hold_id in (
  select id from public.resource_holds where owner_id = '90909090-9090-4090-8090-909090909090'
);
delete from public.resource_holds where owner_id = '90909090-9090-4090-8090-909090909090';
delete from auth.users where id = '90909090-9090-4090-8090-909090909090';
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '90909090-9090-4090-8090-909090909090',
  'authenticated', 'authenticated', 'resource-concurrency@example.test', '', now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
);
insert into public.pages (id, owner_id, name, slug, is_published)
values (
  '91919191-9191-4191-8191-919191919191',
  '90909090-9090-4090-8090-909090909090',
  'Resource concurrency test', 'resource-concurrency-test', true
);
insert into public.resource_pools (
  id, owner_id, page_id, resource_key, label, unit_label, kind, total_quantity
) values (
  '92929292-9292-4292-8292-929292929292',
  '90909090-9090-4090-8090-909090909090',
  '91919191-9191-4191-8191-919191919191',
  'final-unit', 'Final unit', 'units', 'consumable', 1
);

select extensions.dblink_connect('resource_race_a', :'resource_dblink_url');
select extensions.dblink_connect('resource_race_b', :'resource_dblink_url');
select extensions.dblink_send_query('resource_race_a', $race$
  select public.acquire_resource_hold(
    '90909090-9090-4090-8090-909090909090',
    '91919191-9191-4191-8191-919191919191',
    'services:0', repeat('1', 64), repeat('a', 64), repeat('b', 64), repeat('c', 64),
    '[{"poolId":"92929292-9292-4292-8292-929292929292","poolVersion":1,"quantity":1}]'::jsonb,
    1800
  )
$race$);
select extensions.dblink_send_query('resource_race_b', $race$
  select public.acquire_resource_hold(
    '90909090-9090-4090-8090-909090909090',
    '91919191-9191-4191-8191-919191919191',
    'services:0', repeat('2', 64), repeat('d', 64), repeat('e', 64), repeat('f', 64),
    '[{"poolId":"92929292-9292-4292-8292-929292929292","poolVersion":1,"quantity":1}]'::jsonb,
    1800
  )
$race$);

do $wait$
begin
  while extensions.dblink_is_busy('resource_race_a') = 1
    or extensions.dblink_is_busy('resource_race_b') = 1 loop
    perform pg_sleep(0.01);
  end loop;
end
$wait$;

do $drain$
begin
  begin
    perform * from extensions.dblink_get_result('resource_race_a') as result(hold_id uuid);
  exception when others then
    null;
  end;
  begin
    perform * from extensions.dblink_get_result('resource_race_b') as result(hold_id uuid);
  exception when others then
    null;
  end;
end
$drain$;

select extensions.dblink_disconnect('resource_race_a');
select extensions.dblink_disconnect('resource_race_b');

do $assert$
declare
  held_count integer;
  held_quantity integer;
begin
  select count(*), coalesce(sum(allocation.quantity), 0)
  into held_count, held_quantity
  from public.resource_holds hold
  join public.resource_hold_allocations allocation on allocation.hold_id = hold.id
  where allocation.pool_id = '92929292-9292-4292-8292-929292929292'
    and hold.status = 'active';
  if held_count <> 1 or held_quantity <> 1 then
    raise exception 'concurrent final-unit invariant failed: holds %, quantity %', held_count, held_quantity;
  end if;
  raise notice 'concurrent final-unit invariant passed: exactly one buyer acquired the unit';
end
$assert$;

delete from public.resource_allocation_events where hold_id in (
  select id from public.resource_holds where owner_id = '90909090-9090-4090-8090-909090909090'
);
delete from public.resource_hold_allocations where hold_id in (
  select id from public.resource_holds where owner_id = '90909090-9090-4090-8090-909090909090'
);
delete from public.resource_holds where owner_id = '90909090-9090-4090-8090-909090909090';
delete from auth.users where id = '90909090-9090-4090-8090-909090909090';
