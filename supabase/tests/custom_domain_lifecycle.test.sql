begin;
set local search_path = public, extensions;

select plan(24);

select ok(
  to_regclass('private.custom_domain_claims') is not null,
  'the canonical custom-domain claim table exists'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'private.custom_domain_claims'::regclass),
  'custom-domain claims keep row level security enabled'
);
select ok(
  not has_table_privilege('anon', 'private.custom_domain_claims', 'select')
    and not has_table_privilege('authenticated', 'private.custom_domain_claims', 'select')
    and not has_table_privilege('service_role', 'private.custom_domain_claims', 'select'),
  'no Data API role can read private claim rows directly'
);
select ok(
  not has_function_privilege('authenticated', 'public.nz_custom_domain_claim_status(uuid)', 'execute')
    and has_function_privilege('service_role', 'public.nz_custom_domain_claim_status(uuid)', 'execute'),
  'only trusted server routes can read per-page claim status'
);

insert into auth.users (id) values
  ('c0000000-0000-4000-8000-000000000001'),
  ('c0000000-0000-4000-8000-000000000002'),
  ('c0000000-0000-4000-8000-000000000003');

insert into public.billing_subscriptions (owner_id, plan_id, status, account_origin)
values
  ('c0000000-0000-4000-8000-000000000001', 'pro', 'active', 'legacy'),
  ('c0000000-0000-4000-8000-000000000002', 'pro', 'active', 'legacy'),
  ('c0000000-0000-4000-8000-000000000003', 'pro', 'active', 'legacy');

insert into public.pages (
  id, owner_id, name, slug, custom_domain, domain_path
) values (
  'c1000000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-000000000001',
  'Owner A root',
  'claim-owner-a-root',
  ' Reserve.Example.Test ',
  '/'
);

select is(
  (select custom_domain from public.pages where id = 'c1000000-0000-4000-8000-000000000001'),
  'reserve.example.test',
  'the page stores the normalized domain'
);
select ok(
  (
    select owner_id = 'c0000000-0000-4000-8000-000000000001'
      and verified_at is null
      and expires_at between claimed_at + interval '13 days 23 hours'
        and claimed_at + interval '14 days 1 hour'
    from private.custom_domain_claims
    where domain = 'reserve.example.test'
  ),
  'a new unverified claim receives one protected 14-day setup window'
);

select throws_ok(
  $$
    insert into public.pages (
      owner_id, name, slug, custom_domain, domain_path
    ) values (
      'c0000000-0000-4000-8000-000000000002',
      'Owner B blocked',
      'claim-owner-b-blocked',
      'reserve.example.test',
      '/'
    )
  $$,
  '23505',
  'This custom domain is temporarily reserved while another Nexez account finishes setup.',
  'another owner cannot take an unexpired setup reservation'
);

create temporary table claim_clock as
select claimed_at, expires_at
from private.custom_domain_claims
where domain = 'reserve.example.test';

select lives_ok(
  $$
    insert into public.pages (
      id, owner_id, name, slug, custom_domain, domain_path
    ) values (
      'c1000000-0000-4000-8000-000000000002',
      'c0000000-0000-4000-8000-000000000001',
      'Owner A path',
      'claim-owner-a-path',
      'reserve.example.test',
      '/pricing'
    )
  $$,
  'the canonical owner may map another listing path'
);
select ok(
  (
    select c.claimed_at = t.claimed_at and c.expires_at = t.expires_at
    from private.custom_domain_claims c
    cross join claim_clock t
    where c.domain = 'reserve.example.test'
  ),
  'adding another path does not extend the setup reservation'
);

update private.custom_domain_claims
set claimed_at = statement_timestamp() - interval '15 days',
    expires_at = statement_timestamp() - interval '1 second'
where domain = 'reserve.example.test';

select lives_ok(
  $$
    insert into public.pages (
      id, owner_id, name, slug, custom_domain, domain_path
    ) values (
      'c1000000-0000-4000-8000-000000000003',
      'c0000000-0000-4000-8000-000000000002',
      'Owner B reclaimed',
      'claim-owner-b-reclaimed',
      'reserve.example.test',
      '/'
    )
  $$,
  'another owner may atomically reclaim an expired unverified reservation'
);
select is(
  (select owner_id from private.custom_domain_claims where domain = 'reserve.example.test'),
  'c0000000-0000-4000-8000-000000000002'::uuid,
  'reclaim moves canonical ownership to the new merchant'
);
select ok(
  (
    select custom_domain = 'reserve.example.test' and custom_domain_verified is null
    from public.pages
    where id = 'c1000000-0000-4000-8000-000000000001'
  ),
  'reclaim keeps the former merchant page as honest, non-serving history'
);
select is(
  (
    select owned
    from public.nz_custom_domain_claim_status('c1000000-0000-4000-8000-000000000001')
  ),
  false,
  'the trusted status function marks the former page claim as lost'
);
select is(
  (
    select owned
    from public.nz_custom_domain_claim_status('c1000000-0000-4000-8000-000000000003')
  ),
  true,
  'the trusted status function marks the new page claim as owned'
);

select throws_ok(
  $$
    update public.pages
    set custom_domain_verified = statement_timestamp()
    where id = 'c1000000-0000-4000-8000-000000000001'
  $$,
  '23505',
  'This custom domain is temporarily reserved while another Nexez account finishes setup.',
  'a stale page cannot verify another merchant claim'
);

update public.pages
set custom_domain_verified = statement_timestamp()
where id = 'c1000000-0000-4000-8000-000000000003';

select ok(
  (
    select verified_at is not null
    from private.custom_domain_claims
    where domain = 'reserve.example.test'
  ),
  'DNS verification permanently protects the canonical claim'
);

update private.custom_domain_claims
set claimed_at = statement_timestamp() - interval '15 days',
    expires_at = statement_timestamp() - interval '1 second'
where domain = 'reserve.example.test';

select throws_ok(
  $$
    insert into public.pages (
      owner_id, name, slug, custom_domain, domain_path
    ) values (
      'c0000000-0000-4000-8000-000000000003',
      'Owner C blocked',
      'claim-owner-c-blocked',
      'reserve.example.test',
      '/'
    )
  $$,
  '23505',
  'This custom domain is already connected to another Nexez account.',
  'a verified claim never expires or becomes reclaimable'
);

update public.pages
set custom_domain_verified = null
where id = 'c1000000-0000-4000-8000-000000000003';

select ok(
  (
    select verified_at is null
      and expires_at between claimed_at + interval '13 days 23 hours'
        and claimed_at + interval '14 days 1 hour'
    from private.custom_domain_claims
    where domain = 'reserve.example.test'
  ),
  'clearing the last proof starts a fresh protected setup window'
);

delete from public.pages
where id = 'c1000000-0000-4000-8000-000000000003';

select ok(
  not exists (
    select 1
    from private.custom_domain_claims
    where domain = 'reserve.example.test'
  ),
  'removing the canonical owner last page releases the claim'
);
select is(
  (
    select available
    from public.nz_custom_domain_claim_status('c1000000-0000-4000-8000-000000000001')
  ),
  true,
  'a retained stale page distinguishes an available domain from another owner claim'
);

update public.billing_subscriptions
set plan_id = 'free'
where owner_id = 'c0000000-0000-4000-8000-000000000001';

select throws_ok(
  $$
    update public.pages
    set custom_domain = custom_domain
    where id = 'c1000000-0000-4000-8000-000000000001'
  $$,
  '23514',
  'Custom domains are a Launch plan feature.',
  'a downgraded former owner cannot reclaim an available domain through a retained page'
);

insert into public.pages (
  id, owner_id, name, slug, custom_domain, domain_path
) values
  (
    'c1000000-0000-4000-8000-000000000004',
    'c0000000-0000-4000-8000-000000000003',
    'Owner C root',
    'claim-owner-c-root',
    'multi.example.test',
    '/'
  ),
  (
    'c1000000-0000-4000-8000-000000000005',
    'c0000000-0000-4000-8000-000000000003',
    'Owner C path',
    'claim-owner-c-path',
    'multi.example.test',
    '/offers'
  );

delete from public.pages
where id = 'c1000000-0000-4000-8000-000000000004';

select ok(
  exists (
    select 1
    from private.custom_domain_claims
    where domain = 'multi.example.test'
      and owner_id = 'c0000000-0000-4000-8000-000000000003'
  ),
  'removing one path does not release a domain still used by the owner'
);

delete from public.pages
where id = 'c1000000-0000-4000-8000-000000000005';

select ok(
  not exists (
    select 1
    from private.custom_domain_claims
    where domain = 'multi.example.test'
  ),
  'removing the final path releases the shared domain claim'
);

select is(
  (
    select count(*)
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'pages'
      and indexname = 'pages_owner_custom_domain_path_key'
  ),
  1::bigint,
  'owner-scoped host paths keep a unique index after stale history is retained'
);

select * from finish();
rollback;
