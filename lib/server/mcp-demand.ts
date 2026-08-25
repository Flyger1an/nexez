import 'server-only'

import { after } from 'next/server'
import {
  buildMcpDemandRow,
  emptyMcpDemandSnapshot,
  summarizeMcpDemand,
  type McpDemandInput,
  type McpDemandRow,
  type McpDemandSnapshot,
  type McpEndpointEvidence,
  type McpRegistryEvidence,
} from '../mcp-demand'
import { MCP_PROTOCOL_VERSION } from '../mcp-transport'
import { captureError } from '../observability'
import { agentRuntimeUrl } from '../site'
import { createAdminClient, hasSupabaseAdminEnv } from '../../utils/supabase/admin'

const EVIDENCE_WINDOW_DAYS = 30
const MAX_EVENT_ROWS = 5_000
const REGISTRY_SERVER_NAME = 'ai.nexez/commerce'
const REGISTRY_REMOTE_URL = 'https://nexez.app/mcp'
const REGISTRY_API = `https://registry.modelcontextprotocol.io/v0.1/servers?search=${encodeURIComponent(REGISTRY_SERVER_NAME)}`

type CommerceAttributionRow = {
  buyer_agent: string | null
  stripe_livemode: boolean | null
}

export async function persistMcpDemandEvent(input: McpDemandInput): Promise<void> {
  if (!hasSupabaseAdminEnv()) return
  const row = buildMcpDemandRow(input)
  if (!row) return

  try {
    const { error } = await createAdminClient().from('mcp_demand_events').insert(row)
    if (error) captureError(error, { route: 'platform-mcp', op: 'persist_mcp_demand_event' })
  } catch (error) {
    captureError(error, { route: 'platform-mcp', op: 'persist_mcp_demand_event' })
  }
}

/** Keep MCP response latency independent from operational evidence writes. */
export function scheduleMcpDemandEvent(input: McpDemandInput): void {
  try {
    after(() => persistMcpDemandEvent(input))
  } catch {
    // Unit tests and scripts may execute outside a Next request scope.
    void persistMcpDemandEvent(input)
  }
}

export async function getMcpDemandSnapshot(): Promise<McpDemandSnapshot> {
  const generatedAt = new Date().toISOString()
  const since = new Date(
    Date.parse(generatedAt) - EVIDENCE_WINDOW_DAYS * 24 * 60 * 60_000,
  ).toISOString()
  const [registry, endpoint] = await Promise.all([
    getMcpRegistryEvidence(),
    getMcpEndpointEvidence(),
  ])
  if (!hasSupabaseAdminEnv()) {
    return emptyMcpDemandSnapshot(generatedAt, since, registry, endpoint)
  }

  try {
    const admin = createAdminClient()
    const [eventsResult, ordersResult, negotiationsResult] = await Promise.all([
      admin
        .from('mcp_demand_events')
        .select('id,created_at,surface,event_type,tool_name,client_family,outcome,action_ready,handoff_kind,attribution_id')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(MAX_EVENT_ROWS + 1)
        .returns<McpDemandRow[]>(),
      admin
        .from('checkout_orders')
        .select('buyer_agent,stripe_livemode')
        .ilike('buyer_agent', 'Nexez MCP/%')
        .gte('created_at', since)
        .limit(MAX_EVENT_ROWS)
        .returns<CommerceAttributionRow[]>(),
      admin
        .from('agent_negotiations')
        .select('buyer_agent,stripe_livemode')
        .ilike('buyer_agent', 'Nexez MCP/%')
        .gte('created_at', since)
        .limit(MAX_EVENT_ROWS)
        .returns<CommerceAttributionRow[]>(),
    ])
    if (eventsResult.error) throw eventsResult.error
    if (ordersResult.error) throw ordersResult.error
    if (negotiationsResult.error) throw negotiationsResult.error

    const rows = eventsResult.data ?? []
    const truncated = rows.length > MAX_EVENT_ROWS
    return summarizeMcpDemand(
      rows.slice(0, MAX_EVENT_ROWS),
      [...(ordersResult.data ?? []), ...(negotiationsResult.data ?? [])],
      generatedAt,
      since,
      registry,
      endpoint,
      truncated,
    )
  } catch (error) {
    captureError(error instanceof Error ? error : new Error('MCP demand snapshot failed'), {
      scope: 'mcp-demand:snapshot',
    })
    return emptyMcpDemandSnapshot(generatedAt, since, registry, endpoint)
  }
}

async function getMcpRegistryEvidence(): Promise<McpRegistryEvidence> {
  try {
    const response = await fetch(REGISTRY_API, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5_000),
    })
    if (!response.ok) throw new Error(`Registry returned ${response.status}.`)
    const body = await response.json() as { servers?: unknown[] }
    const match = (body.servers ?? [])
      .map((item) => registryRecord(item))
      .find((item) => item?.name === REGISTRY_SERVER_NAME)
    if (!match) {
      return {
        status: 'unpublished',
        version: null,
        detail: 'The official MCP Registry does not list the Nexez server yet.',
      }
    }
    const hasRemote = match.remotes.some((remote) => remote.type === 'streamable-http' && remote.url === REGISTRY_REMOTE_URL)
    if (!hasRemote) {
      return {
        status: 'unavailable',
        version: match.version,
        detail: 'The Registry entry exists, but its public MCP URL does not match Nexez production.',
      }
    }
    return {
      status: 'published',
      version: match.version,
      detail: `Official MCP Registry metadata points to ${REGISTRY_REMOTE_URL}.`,
    }
  } catch (error) {
    return {
      status: 'unavailable',
      version: null,
      detail: error instanceof Error
        ? `The official MCP Registry could not be checked: ${error.message}`
        : 'The official MCP Registry could not be checked.',
    }
  }
}

async function getMcpEndpointEvidence(): Promise<McpEndpointEvidence> {
  const body = {
    jsonrpc: '2.0',
    id: 'launch-control-discover',
    method: 'server/discover',
    params: {
      _meta: {
        'io.modelcontextprotocol/protocolVersion': MCP_PROTOCOL_VERSION,
        'io.modelcontextprotocol/clientInfo': { name: 'Nexez Launch Control', version: '1.0.0' },
        'io.modelcontextprotocol/clientCapabilities': {},
      },
    },
  }
  try {
    const response = await fetch(agentRuntimeUrl('/mcp'), {
      method: 'POST',
      headers: {
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
        'mcp-protocol-version': MCP_PROTOCOL_VERSION,
        'mcp-method': 'server/discover',
        ...(process.env.CRON_SECRET
          ? { 'x-nexez-internal-probe': process.env.CRON_SECRET }
          : {}),
      },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(5_000),
    })
    const result = await response.json() as {
      result?: { supportedVersions?: unknown; capabilities?: unknown; resultType?: unknown }
      error?: { message?: unknown }
    }
    const supported = Array.isArray(result.result?.supportedVersions)
      && result.result.supportedVersions.includes(MCP_PROTOCOL_VERSION)
    const capabilities = result.result?.capabilities
    const validCapabilities = isRecord(capabilities)
      && 'tools' in capabilities
      && 'resources' in capabilities
    if (!response.ok || result.result?.resultType !== 'complete' || !supported || !validCapabilities) {
      return {
        status: 'invalid',
        protocolVersion: null,
        detail: typeof result.error?.message === 'string'
          ? result.error.message
          : 'Production did not return a valid MCP discovery contract.',
      }
    }
    return {
      status: 'ready',
      protocolVersion: MCP_PROTOCOL_VERSION,
      detail: 'Production supports current MCP discovery, tools, and resources.',
    }
  } catch (error) {
    return {
      status: 'unavailable',
      protocolVersion: null,
      detail: error instanceof Error
        ? `The production MCP endpoint could not be checked: ${error.message}`
        : 'The production MCP endpoint could not be checked.',
    }
  }
}

function registryRecord(value: unknown): {
  name: string
  version: string | null
  remotes: Array<{ type: string; url: string }>
} | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const outer = value as Record<string, unknown>
  const candidate = outer.server && typeof outer.server === 'object' && !Array.isArray(outer.server)
    ? outer.server as Record<string, unknown>
    : outer
  if (typeof candidate.name !== 'string') return null
  const remotes = Array.isArray(candidate.remotes)
    ? candidate.remotes.flatMap((remote) => {
        if (!remote || typeof remote !== 'object' || Array.isArray(remote)) return []
        const record = remote as Record<string, unknown>
        return typeof record.type === 'string' && typeof record.url === 'string'
          ? [{ type: record.type, url: record.url }]
          : []
      })
    : []
  return {
    name: candidate.name,
    version: typeof candidate.version === 'string' ? candidate.version : null,
    remotes,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
