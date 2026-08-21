begin;

select plan(11);

select ok(
  to_regclass('public.commerce_demand_signals') is not null,
  'commerce demand signal ledger exists'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.commerce_demand_signals'::regclass),
  'row level security is enabled'
);

select ok(
  not has_table_privilege('anon', 'public.commerce_demand_signals', 'select'),
  'anonymous clients cannot read demand signals'
);

select ok(
  not has_table_privilege('anon', 'public.commerce_demand_signals', 'insert'),
  'anonymous clients cannot append demand signals'
);

select ok(
  not has_table_privilege('authenticated', 'public.commerce_demand_signals', 'select'),
  'authenticated clients cannot read demand signals'
);

select ok(
  not has_table_privilege('authenticated', 'public.commerce_demand_signals', 'insert'),
  'authenticated clients cannot append demand signals'
);

select ok(
  has_table_privilege('service_role', 'public.commerce_demand_signals', 'select'),
  'service role can read demand signals server-side'
);

select ok(
  has_table_privilege('service_role', 'public.commerce_demand_signals', 'insert'),
  'service role can append demand signals server-side'
);

select ok(
  not has_table_privilege('service_role', 'public.commerce_demand_signals', 'update'),
  'service role cannot rewrite demand history'
);

select ok(
  not has_table_privilege('service_role', 'public.commerce_demand_signals', 'delete'),
  'service role cannot delete demand history'
);

select throws_ok(
  $$
    insert into public.commerce_demand_signals (
      mode,
      intent,
      reference_id,
      reference_domain
    ) values (
      'coverage_gap',
      'overview',
      'events.private-chef',
      'events-hospitality'
    )
  $$,
  '23514',
  null,
  'coverage gaps cannot retain a canonical reference'
);

select * from finish();

rollback;
