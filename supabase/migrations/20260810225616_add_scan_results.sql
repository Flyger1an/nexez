-- Anonymized scan-result persistence for the public /scan scanner.
-- Every completed scan (organic visitor or research study cohort) appends one
-- row of aggregate, privacy-safe metrics so agent-readiness can be studied in
-- aggregate and trended over time.
--
-- Privacy stance:
--   * domain_hash (salted sha256 of the final hostname) supports dedupe.
--   * domain (raw final hostname) is service-role only and must NEVER appear
--     in any aggregate query, view, export, or public output.
--   * Nothing else identifying is stored: no IPs, no user ids, no page bodies.
-- Access: service-role only. RLS enabled with no policies; anon/authenticated
-- grants are revoked outright as defense in depth (release_certifications
-- pattern), and service_role is trimmed to append + read.

create table if not exists public.scan_results (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  -- Cohort provenance: 'organic' = a visitor used /scan; 'study' = the batch
  -- research harness. Study rows carry a cohort label and assigned vertical.
  source text not null default 'organic' check (source in ('organic', 'study')),
  study_cohort text,
  vertical text,

  -- Dedupe key + service-role-only raw hostname (see privacy note above).
  domain_hash text not null,
  domain text,

  scanner_version integer not null,
  score integer not null check (score >= 0 and score <= 100),
  dimension_scores jsonb not null default '{}'::jsonb,
  elapsed_ms integer,

  -- Raw page signals
  http_status integer,
  response_ms integer,
  https boolean not null default false,
  has_title boolean not null default false,
  has_meta_description boolean not null default false,
  has_h1 boolean not null default false,

  -- Structured data evidence
  has_json_ld boolean not null default false,
  valid_json_ld boolean not null default false,
  schema_types text[] not null default '{}',
  has_business_identity boolean not null default false,
  has_offer_schema boolean not null default false,
  has_structured_price boolean not null default false,
  has_visible_price boolean not null default false,
  has_action_path boolean not null default false,
  has_structured_action boolean not null default false,
  has_structured_availability boolean not null default false,
  has_visible_availability boolean not null default false,
  has_offer_details boolean not null default false,
  has_contact boolean not null default false,
  has_policies boolean not null default false,
  has_freshness_signal boolean not null default false,

  -- Callable / agent artifacts
  agent_json_ok boolean not null default false,
  well_known_agent_json_ok boolean not null default false,
  well_known_agent_card_ok boolean not null default false,
  mcp_json_ok boolean not null default false,
  open_api_json_ok boolean not null default false,
  llms_txt_ok boolean not null default false,

  -- Per-bot robots.txt verdicts, e.g. {"GPTBot": true, "ClaudeBot": false}
  robots jsonb not null default '{}'::jsonb,
  blocked_bot_count integer not null default 0
);

comment on column public.scan_results.domain is
  'Raw final hostname. Service-role only; must never appear in aggregate queries, views, or public output.';

create index if not exists scan_results_created_at_idx on public.scan_results (created_at desc);
create index if not exists scan_results_source_cohort_idx on public.scan_results (source, study_cohort);
create index if not exists scan_results_domain_hash_idx on public.scan_results (domain_hash);

alter table public.scan_results enable row level security;
-- No policies: only the service-role key (which bypasses RLS) touches this.

-- Defense in depth: strip Supabase's default public-schema grants so anon and
-- authenticated are hard-denied at the ACL layer, not just RLS-filtered.
revoke all privileges on table public.scan_results from anon, authenticated;
-- The app only appends rows and reads aggregates server-side.
revoke all privileges on table public.scan_results from service_role;
grant select, insert on table public.scan_results to service_role;
