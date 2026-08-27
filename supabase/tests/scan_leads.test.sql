-- scan_leads holds email addresses for people who are NOT users. Everything below
-- is about the obligations that creates: consent is recorded, an unsubscribe can
-- never be undone, and nothing reachable by PostgREST can read the table.

begin;
set local search_path = public, extensions;

select plan(28);

insert into auth.users (id) values ('c0000000-0000-0000-0000-000000000001');

insert into public.scan_leads (id, email, domain, score, findings, unsubscribe_token_hash)
values (
  'd0000000-0000-0000-0000-000000000001',
  'owner@example.com',
  'axleplumbing.com',
  34,
  '[["Prices","Missing"]]'::jsonb,
  repeat('a', 64)
);

-- ---------------------------------------------------------------------------
-- Normalisation. The unique key is (email, domain), so a row that stores a
-- differently-cased address would let the same person be queued twice.
-- ---------------------------------------------------------------------------

select throws_ok(
  $$insert into public.scan_leads (email, domain, unsubscribe_token_hash)
    values ('Owner@Example.com', 'other.com', repeat('b', 64))$$,
  '23514',
  null,
  'an address that is not lowercased is rejected'
);

select throws_ok(
  $$insert into public.scan_leads (email, domain, unsubscribe_token_hash)
    values ('owner@example.com', 'Other.com', repeat('b', 64))$$,
  '23514',
  null,
  'a domain that is not lowercased is rejected'
);

select throws_ok(
  $$insert into public.scan_leads (email, domain, unsubscribe_token_hash)
    values ('not-an-address', 'other.com', repeat('b', 64))$$,
  '23514',
  null,
  'a value that cannot be an address is rejected'
);

select throws_ok(
  $$insert into public.scan_leads (email, domain, unsubscribe_token_hash)
    values ('owner@example.com', 'axleplumbing.com', repeat('c', 64))$$,
  '23505',
  null,
  'the same address is not queued twice for the same site'
);

select lives_ok(
  $$insert into public.scan_leads (email, domain, unsubscribe_token_hash)
    values ('owner@example.com', 'second-site.com', repeat('d', 64))$$,
  'the same address may be queued for a different site'
);

select throws_ok(
  $$insert into public.scan_leads (email, domain, unsubscribe_token_hash)
    values ('other@example.com', 'third.com', repeat('a', 64))$$,
  '23505',
  null,
  'an unsubscribe token cannot be shared between rows'
);

-- ---------------------------------------------------------------------------
-- Score and findings. Both are rendered into a stranger's inbox, so the database
-- refuses the shapes that would render as nonsense.
-- ---------------------------------------------------------------------------

select throws_ok(
  $$insert into public.scan_leads (email, domain, score, unsubscribe_token_hash)
    values ('score@example.com', 'score.com', 140, repeat('e', 64))$$,
  '23514',
  null,
  'a score outside the scale is rejected'
);

select throws_ok(
  $$insert into public.scan_leads (email, domain, findings, unsubscribe_token_hash)
    values ('shape@example.com', 'shape.com', '{"a":1}'::jsonb, repeat('f', 64))$$,
  '23514',
  null,
  'findings that are not a list are rejected'
);

select throws_ok(
  $$insert into public.scan_leads (email, domain, consent_source, unsubscribe_token_hash)
    values ('src@example.com', 'src.com', 'scraped', repeat('1', 64))$$,
  '23514',
  null,
  'an unrecognised consent source is rejected'
);

select ok(
  (select consented_at is not null and consent_source = 'scan_page'
   from public.scan_leads where id = 'd0000000-0000-0000-0000-000000000001'),
  'consent is stamped on the row that holds the address'
);

-- ---------------------------------------------------------------------------
-- An unsubscribe is final. This is the rule that must not depend on every
-- future call site remembering it.
-- ---------------------------------------------------------------------------

update public.scan_leads
set unsubscribed_at = now()
where id = 'd0000000-0000-0000-0000-000000000001';

select ok(
  (select unsubscribed_at is not null
   from public.scan_leads where id = 'd0000000-0000-0000-0000-000000000001'),
  'an unsubscribe is recorded'
);

select throws_ok(
  $$update public.scan_leads set unsubscribed_at = null
    where id = 'd0000000-0000-0000-0000-000000000001'$$,
  '23514',
  null,
  'an unsubscribe cannot be reversed'
);

select throws_ok(
  $$update public.scan_leads set email = 'someone-else@example.com'
    where id = 'd0000000-0000-0000-0000-000000000001'$$,
  '23514',
  null,
  'the address on a row is immutable, so a suppression cannot be moved off it'
);

insert into public.scan_lead_suppressions (email, source_lead_id)
values ('owner@example.com', 'd0000000-0000-0000-0000-000000000001');

select is(
  (select count(*)::int from public.scan_leads
   where email = 'owner@example.com' and unsubscribed_at is not null),
  2,
  'one unsubscribe suppresses every scan row for the address'
);

select throws_ok(
  $$insert into public.scan_leads (email, domain, unsubscribe_token_hash)
    values ('owner@example.com', 'future-site.com', repeat('9', 64))$$,
  '23514',
  null,
  'a suppressed address cannot be queued for a future domain'
);

select lives_ok(
  $$update public.scan_leads set delivered_at = null, delivery_attempts = 0
    where id = 'd0000000-0000-0000-0000-000000000001'$$,
  'delivery state stays writable on a suppressed row'
);

-- ---------------------------------------------------------------------------
-- The send queue. The partial index and the columns behind it are what stop a
-- suppressed or exhausted address being picked up again.
-- ---------------------------------------------------------------------------

select ok(
  (select count(*) = 0
   from public.scan_leads
   where delivered_at is null and unsubscribed_at is null
     and id = 'd0000000-0000-0000-0000-000000000001'),
  'a suppressed row is not in the send queue even with delivery state cleared'
);

select has_index('public', 'scan_leads', 'scan_leads_pending_delivery_idx',
  'the send queue is indexed');

select ok(
  (select delivery_attempts = 0 from public.scan_leads where domain = 'second-site.com'),
  'delivery attempts start at zero'
);

select throws_ok(
  $$update public.scan_leads set delivery_attempts = -1 where domain = 'second-site.com'$$,
  '23514',
  null,
  'a negative attempt count is rejected'
);

-- ---------------------------------------------------------------------------
-- Housekeeping and exposure.
-- ---------------------------------------------------------------------------

-- now() is the transaction timestamp, so a same-transaction write cannot move
-- updated_at forward. Prove the trigger runs by showing it overrides a value the
-- caller supplied, which is the property that actually matters.
update public.scan_leads
set updated_at = '2000-01-01T00:00:00Z'
where id = 'd0000000-0000-0000-0000-000000000001';

select ok(
  (select updated_at > '2020-01-01T00:00:00Z'::timestamptz
   from public.scan_leads where id = 'd0000000-0000-0000-0000-000000000001'),
  'updated_at is owned by the database, not by the caller'
);

select ok(
  (select relrowsecurity from pg_class
   where oid = 'public.scan_leads'::regclass),
  'row level security is on'
);

select is(
  (select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'scan_leads'),
  0,
  'no policy exists, so only the service role reaches the table'
);

select is(
  (select count(*)::int
   from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'scan_leads'
     and grantee in ('anon', 'authenticated')),
  0,
  'PostgREST roles hold no grant on the table'
);

select ok(
  (select relrowsecurity from pg_class
   where oid = 'public.scan_lead_suppressions'::regclass),
  'row level security is on for the suppression ledger'
);

select is(
  (select count(*)::int
   from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'scan_lead_suppressions'
     and grantee in ('anon', 'authenticated')),
  0,
  'PostgREST visitor roles hold no grant on the suppression ledger'
);

select is(
  (select count(*)::int
   from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'scan_leads'
     and grantee = 'service_role'),
  3,
  'the service role has only select, insert, and update on scan leads'
);

select ok(
  (select conname is not null from pg_constraint
   where conrelid = 'public.scan_leads'::regclass
     and confrelid = 'auth.users'::regclass),
  'a converted lead points at a real account'
);

select * from finish();
rollback;
