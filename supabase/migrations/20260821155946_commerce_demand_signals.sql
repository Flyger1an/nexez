-- Privacy-safe Commerce Intelligence demand telemetry from the public simulator.
-- This table deliberately stores only controlled categorical dimensions. It
-- never stores buyer query text, request labels, merchant identity, location,
-- user/session identifiers, IP addresses, or user-agent strings.
--
-- Access is service-role only. Public clients neither write nor read this
-- operational signal ledger; platform-admin UI reads aggregates server-side.

create table if not exists public.commerce_demand_signals (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  surface text not null default 'homepage_simulator'
    check (surface = 'homepage_simulator'),
  mode text not null
    check (mode in ('marketplace', 'partial_match', 'simulation', 'coverage_gap')),
  intent text not null
    check (intent in ('booking', 'pricing', 'fit', 'product', 'contact', 'overview')),
  reference_id text,
  reference_domain text,

  constraint commerce_demand_reference_pair check (
    (reference_id is null and reference_domain is null)
    or (reference_id is not null and reference_domain is not null)
  ),
  constraint commerce_demand_reference_id_shape check (
    reference_id is null
    or (char_length(reference_id) <= 120 and reference_id ~ '^[a-z0-9]+([.-][a-z0-9]+)*$')
  ),
  constraint commerce_demand_reference_domain check (
    reference_domain is null
    or reference_domain in (
      'home-property',
      'automotive-mobile',
      'events-hospitality',
      'beauty-fitness-personal',
      'professional-creative-technical',
      'education-family-pet',
      'local-commercial-operations'
    )
  ),
  constraint commerce_demand_simulation_has_reference check (
    mode <> 'simulation' or reference_id is not null
  ),
  constraint commerce_demand_gap_has_no_reference check (
    mode <> 'coverage_gap' or reference_id is null
  )
);

comment on table public.commerce_demand_signals is
  'Service-role-only categorical simulator outcomes. Contains no raw buyer request text or visitor identity.';
comment on column public.commerce_demand_signals.reference_id is
  'Canonical code-owned Commerce reference id; null for unmapped coverage gaps.';

create index if not exists commerce_demand_signals_created_at_idx
  on public.commerce_demand_signals (created_at desc);

alter table public.commerce_demand_signals enable row level security;
-- No policies: only the server-side service role may touch this ledger.
revoke all privileges on table public.commerce_demand_signals from public, anon, authenticated;
revoke all privileges on table public.commerce_demand_signals from service_role;
grant select, insert on table public.commerce_demand_signals to service_role;
