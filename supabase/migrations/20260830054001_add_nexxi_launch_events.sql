-- Privacy-conscious Nexxi activation telemetry for closed beta.
-- The mobile client can only write through the authenticated Nexez API. Direct
-- browser roles have no grants or RLS policies on this table.
create table if not exists public.nexxi_launch_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_event_id uuid not null,
  event_name text not null check (event_name in (
    'app_opened',
    'onboarding_completed',
    'agent_turn_completed',
    'checkout_started',
    'checkout_returned',
    'feedback_opened'
  )),
  outcome text check (outcome is null or outcome in ('success', 'cancelled', 'interrupted')),
  platform text not null check (platform in ('ios', 'android', 'web', 'unknown')),
  app_version text check (app_version is null or char_length(app_version) <= 40),
  build_version text check (build_version is null or char_length(build_version) <= 40),
  runtime_version text check (runtime_version is null or char_length(runtime_version) <= 80),
  update_id text check (update_id is null or char_length(update_id) <= 80),
  channel text check (channel is null or char_length(channel) <= 40),
  created_at timestamptz not null default now(),
  constraint nexxi_launch_events_user_client_event_unique unique (user_id, client_event_id),
  constraint nexxi_launch_events_outcome_scope check (
    (event_name = 'checkout_returned' and outcome is not null)
    or (event_name <> 'checkout_returned' and outcome is null)
  )
);

create index if not exists nexxi_launch_events_user_created_idx
  on public.nexxi_launch_events (user_id, created_at desc);

create index if not exists nexxi_launch_events_name_created_idx
  on public.nexxi_launch_events (event_name, created_at desc);

alter table public.nexxi_launch_events enable row level security;

revoke all on table public.nexxi_launch_events from public, anon, authenticated;
grant select, insert, delete on table public.nexxi_launch_events to service_role;

comment on table public.nexxi_launch_events is
  'Minimal authenticated Nexxi activation funnel events. No message text, email, IP address, advertising id, or arbitrary metadata.';
