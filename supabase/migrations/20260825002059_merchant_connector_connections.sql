-- Encrypted, service-role-only connector credentials and operational state.
-- Status-only public.user_integrations remains the account overview. This table
-- is the per-listing source of truth for OAuth and application-authorized
-- connectors. Raw credentials never cross the Data API to a browser client.

create table public.merchant_connector_connections (
  page_id uuid not null references public.pages(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  credential_encrypted text not null,
  status text not null default 'connected',
  external_account_id text,
  granted_scopes text[] not null default '{}',
  capabilities text[] not null default '{}',
  expires_at timestamptz,
  last_synced_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (page_id, provider),
  constraint merchant_connector_provider_check check (
    provider in ('square', 'google_calendar', 'woocommerce', 'servicem8')
  ),
  constraint merchant_connector_status_check check (
    status in ('connected', 'attention', 'revoked')
  )
);

create index merchant_connector_connections_owner_idx
  on public.merchant_connector_connections (owner_id);

alter table public.merchant_connector_connections enable row level security;

revoke all on table public.merchant_connector_connections from anon, authenticated;
grant select, insert, update, delete on table public.merchant_connector_connections to service_role;

comment on table public.merchant_connector_connections is
  'Encrypted per-listing connector credentials. Service-role only. Browser clients receive status and capability metadata through authorized server routes.';

comment on column public.merchant_connector_connections.credential_encrypted is
  'AES-256-GCM encrypted provider credential JSON. Never expose through client responses, logs, analytics, or public artifacts.';
