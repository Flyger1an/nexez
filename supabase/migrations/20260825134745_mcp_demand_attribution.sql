-- Privacy-safe evidence for the public Nexez MCP server. This ledger stores
-- only controlled categories and an opaque attribution id. It never stores
-- prompts, query text, buyer identity, merchant identity, IP addresses,
-- user-agent strings, headers, or device details.

create table if not exists public.mcp_demand_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  surface text not null default 'platform_mcp'
    check (surface = 'platform_mcp'),
  event_type text not null
    check (event_type in (
      'discover',
      'initialize',
      'tools_list',
      'resources_list',
      'resource_read',
      'tool_call'
    )),
  tool_name text
    check (tool_name is null or tool_name in (
      'nexez_search',
      'nexez_directory',
      'nexez_get_page',
      'nexez_validate_checkout',
      'nexez_validate_negotiation'
    )),
  client_family text not null
    check (client_family in (
      'claude',
      'chatgpt',
      'cursor',
      'vscode',
      'openclaw',
      'gemini',
      'mcp_inspector',
      'mcp_sdk',
      'other'
    )),
  outcome text not null
    check (outcome in ('handled', 'protocol_error', 'upstream_error')),
  action_ready boolean not null default false,
  handoff_kind text
    check (handoff_kind is null or handoff_kind in ('checkout', 'negotiation')),
  attribution_id uuid,

  constraint mcp_demand_tool_shape check (
    (event_type = 'tool_call' and tool_name is not null)
    or (event_type <> 'tool_call' and tool_name is null)
  ),
  constraint mcp_demand_handoff_shape check (
    (handoff_kind is null and attribution_id is null)
    or (handoff_kind is not null and attribution_id is not null)
  ),
  constraint mcp_demand_handoff_tool check (
    handoff_kind is null
    or (handoff_kind = 'checkout' and tool_name = 'nexez_validate_checkout')
    or (handoff_kind = 'negotiation' and tool_name = 'nexez_validate_negotiation')
  ),
  constraint mcp_demand_action_ready_shape check (
    not action_ready or (handoff_kind is not null and attribution_id is not null)
  )
);

comment on table public.mcp_demand_events is
  'Service-role-only categorical MCP usage evidence. Contains no raw prompt, visitor, request-header, device, or merchant identity data.';
comment on column public.mcp_demand_events.attribution_id is
  'Opaque UUID copied into buyer_agent for an approved handoff. It is not a person, session, or device identifier.';

create index if not exists mcp_demand_events_created_at_idx
  on public.mcp_demand_events (created_at desc);

create unique index if not exists mcp_demand_events_attribution_id_idx
  on public.mcp_demand_events (attribution_id)
  where attribution_id is not null;

alter table public.mcp_demand_events enable row level security;
-- No policies: only the server-side service role may touch this evidence ledger.
revoke all privileges on table public.mcp_demand_events from public, anon, authenticated;
revoke all privileges on table public.mcp_demand_events from service_role;
grant select, insert on table public.mcp_demand_events to service_role;
