-- Hardening migration for the current Nexez MVP surface.
-- Keeps app-visible Supabase columns in sync with the builder/settings UI
-- and makes Data API grants explicit for newer Supabase defaults.

alter table public.pages
  add column if not exists mcp_enabled boolean not null default false,
  add column if not exists simulations jsonb not null default '[]'::jsonb,
  add column if not exists verification_details jsonb not null default '{}'::jsonb,
  add column if not exists agent_memory jsonb,
  add column if not exists team_collaboration jsonb not null default '{"approvals":[]}'::jsonb,
  add column if not exists versions jsonb not null default '[]'::jsonb,
  add column if not exists google_calendar_id text,
  add column if not exists next_available text,
  add column if not exists domain_verification_token text,
  add column if not exists custom_domain_verified timestamptz,
  add column if not exists calendly_webhook_secret text,
  add column if not exists llm_opt_in boolean not null default false;

create index if not exists pages_custom_domain_idx
  on public.pages (custom_domain)
  where custom_domain is not null;

create index if not exists pages_mcp_enabled_idx
  on public.pages (mcp_enabled)
  where mcp_enabled = true;

-- New Supabase projects no longer necessarily expose public tables through
-- the Data API by default. Keep the grants deliberate and paired with RLS.
grant select on public.pages to anon;
grant select, insert, update, delete on public.pages to authenticated;

alter table public.checkout_events
  drop constraint if exists checkout_events_event_type_check;

alter table public.checkout_events
  add constraint checkout_events_event_type_check
  check (
    event_type in (
      'checkout_view',
      'checkout_attempt',
      'provider_redirect',
      'stripe_session_created',
      'stripe_missing_config',
      'stripe_error',
      'stripe_price_sync'
    )
  );

grant select, insert on public.checkout_events to anon, authenticated;
