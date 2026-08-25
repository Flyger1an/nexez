export const MCP_TOOL_NAMES = [
  'nexez_search',
  'nexez_directory',
  'nexez_get_page',
  'nexez_validate_checkout',
  'nexez_validate_negotiation',
] as const

export type McpToolName = (typeof MCP_TOOL_NAMES)[number]
export type McpClientFamily =
  | 'claude'
  | 'chatgpt'
  | 'cursor'
  | 'vscode'
  | 'openclaw'
  | 'gemini'
  | 'mcp_inspector'
  | 'mcp_sdk'
  | 'other'
export type McpDemandEventType =
  | 'discover'
  | 'initialize'
  | 'tools_list'
  | 'resources_list'
  | 'resource_read'
  | 'tool_call'
export type McpDemandOutcome = 'handled' | 'protocol_error' | 'upstream_error'
export type McpHandoffKind = 'checkout' | 'negotiation'

export type McpDemandInput = {
  eventType: McpDemandEventType
  toolName?: McpToolName | null
  clientFamily: McpClientFamily
  outcome: McpDemandOutcome
  actionReady?: boolean
  handoffKind?: McpHandoffKind | null
  attributionId?: string | null
}

export type McpDemandRow = {
  id: string
  created_at: string
  surface: 'platform_mcp'
  event_type: McpDemandEventType
  tool_name: McpToolName | null
  client_family: McpClientFamily
  outcome: McpDemandOutcome
  action_ready: boolean
  handoff_kind: McpHandoffKind | null
  attribution_id: string | null
}

export type McpRegistryEvidence = {
  status: 'published' | 'unpublished' | 'unavailable'
  version: string | null
  detail: string
}

export type McpEndpointEvidence = {
  status: 'ready' | 'invalid' | 'unavailable'
  protocolVersion: string | null
  detail: string
}

export type McpDemandSnapshot = {
  generatedAt: string
  since: string
  available: boolean
  truncated: boolean
  totalCalls: number
  toolCalls: number
  actionReady: number
  attributedCommerce: number
  liveCommerce: number
  clients: Array<{ family: McpClientFamily; calls: number }>
  tools: Array<{ name: McpToolName; calls: number; actionReady: number }>
  registry: McpRegistryEvidence
  endpoint: McpEndpointEvidence
}

const TOOL_NAMES = new Set<string>(MCP_TOOL_NAMES)
const CLIENT_FAMILIES = new Set<McpClientFamily>([
  'claude',
  'chatgpt',
  'cursor',
  'vscode',
  'openclaw',
  'gemini',
  'mcp_inspector',
  'mcp_sdk',
  'other',
])
const EVENT_TYPES = new Set<McpDemandEventType>([
  'discover',
  'initialize',
  'tools_list',
  'resources_list',
  'resource_read',
  'tool_call',
])
const OUTCOMES = new Set<McpDemandOutcome>(['handled', 'protocol_error', 'upstream_error'])
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const BUYER_AGENT = /^Nexez MCP\/([a-z_]+)\/([0-9a-f-]{36})$/i

/** Build the complete persistence allowlist without spreading caller data. */
export function buildMcpDemandRow(
  input: McpDemandInput,
): Omit<McpDemandRow, 'id' | 'created_at'> | null {
  if (!EVENT_TYPES.has(input.eventType)) return null
  if (!CLIENT_FAMILIES.has(input.clientFamily)) return null
  if (!OUTCOMES.has(input.outcome)) return null

  const toolName = input.toolName && TOOL_NAMES.has(input.toolName)
    ? input.toolName
    : null
  if ((input.eventType === 'tool_call') !== Boolean(toolName)) return null

  const handoffKind = input.handoffKind === 'checkout' || input.handoffKind === 'negotiation'
    ? input.handoffKind
    : null
  const attributionId = input.attributionId && UUID.test(input.attributionId)
    ? input.attributionId.toLowerCase()
    : null
  if (Boolean(handoffKind) !== Boolean(attributionId)) return null
  if (handoffKind === 'checkout' && toolName !== 'nexez_validate_checkout') return null
  if (handoffKind === 'negotiation' && toolName !== 'nexez_validate_negotiation') return null
  if (input.actionReady && (!handoffKind || !attributionId)) return null

  return {
    surface: 'platform_mcp',
    event_type: input.eventType,
    tool_name: toolName,
    client_family: input.clientFamily,
    outcome: input.outcome,
    action_ready: input.actionReady === true,
    handoff_kind: handoffKind,
    attribution_id: attributionId,
  }
}

export function classifyMcpClient(value: unknown): McpClientFamily {
  const name = typeof value === 'string' ? value.toLowerCase() : ''
  if (name.includes('claude') || name.includes('anthropic')) return 'claude'
  if (name.includes('chatgpt') || name.includes('openai')) return 'chatgpt'
  if (name.includes('cursor')) return 'cursor'
  if (name.includes('visual studio code') || name.includes('vscode')) return 'vscode'
  if (name.includes('openclaw')) return 'openclaw'
  if (name.includes('gemini') || name.includes('google')) return 'gemini'
  if (name.includes('inspector')) return 'mcp_inspector'
  if (name.includes('modelcontextprotocol') || name.includes('mcp sdk') || name.includes('mcp-sdk')) return 'mcp_sdk'
  return 'other'
}

export function mcpEventType(method: string): McpDemandEventType | null {
  if (method === 'server/discover') return 'discover'
  if (method === 'initialize') return 'initialize'
  if (method === 'tools/list') return 'tools_list'
  if (method === 'resources/list') return 'resources_list'
  if (method === 'resources/read') return 'resource_read'
  if (method === 'tools/call') return 'tool_call'
  return null
}

export function mcpHandoffKind(toolName: McpToolName | null): McpHandoffKind | null {
  if (toolName === 'nexez_validate_checkout') return 'checkout'
  if (toolName === 'nexez_validate_negotiation') return 'negotiation'
  return null
}

export function buildMcpBuyerAgent(family: McpClientFamily, attributionId: string): string | null {
  if (!CLIENT_FAMILIES.has(family) || !UUID.test(attributionId)) return null
  return `Nexez MCP/${family}/${attributionId.toLowerCase()}`
}

export function parseMcpBuyerAgent(value: unknown): {
  family: McpClientFamily
  attributionId: string
} | null {
  if (typeof value !== 'string') return null
  const match = BUYER_AGENT.exec(value)
  if (!match || !CLIENT_FAMILIES.has(match[1] as McpClientFamily) || !UUID.test(match[2])) return null
  return { family: match[1] as McpClientFamily, attributionId: match[2].toLowerCase() }
}

export function emptyMcpDemandSnapshot(
  generatedAt = new Date().toISOString(),
  since = new Date(Date.parse(generatedAt) - 30 * 24 * 60 * 60_000).toISOString(),
  registry: McpRegistryEvidence = { status: 'unavailable', version: null, detail: 'Registry evidence is unavailable.' },
  endpoint: McpEndpointEvidence = { status: 'unavailable', protocolVersion: null, detail: 'Endpoint evidence is unavailable.' },
): McpDemandSnapshot {
  return {
    generatedAt,
    since,
    available: false,
    truncated: false,
    totalCalls: 0,
    toolCalls: 0,
    actionReady: 0,
    attributedCommerce: 0,
    liveCommerce: 0,
    clients: [],
    tools: [],
    registry,
    endpoint,
  }
}

export function summarizeMcpDemand(
  rows: McpDemandRow[],
  commerceRows: Array<{ buyer_agent: string | null; stripe_livemode: boolean | null }>,
  generatedAt: string,
  since: string,
  registry: McpRegistryEvidence,
  endpoint: McpEndpointEvidence,
  truncated = false,
): McpDemandSnapshot {
  const readyIds = new Set(
    rows.filter((row) => row.action_ready && row.attribution_id).map((row) => row.attribution_id as string),
  )
  const attributable = new Map<string, { live: boolean }>()
  for (const row of commerceRows) {
    const buyerAgent = parseMcpBuyerAgent(row.buyer_agent)
    if (!buyerAgent || !readyIds.has(buyerAgent.attributionId)) continue
    const existing = attributable.get(buyerAgent.attributionId)
    attributable.set(buyerAgent.attributionId, { live: existing?.live === true || row.stripe_livemode === true })
  }

  const clientCounts = new Map<McpClientFamily, number>()
  const toolCounts = new Map<McpToolName, { calls: number; actionReady: number }>()
  for (const row of rows) {
    clientCounts.set(row.client_family, (clientCounts.get(row.client_family) ?? 0) + 1)
    if (row.tool_name) {
      const current = toolCounts.get(row.tool_name) ?? { calls: 0, actionReady: 0 }
      current.calls += 1
      if (row.action_ready) current.actionReady += 1
      toolCounts.set(row.tool_name, current)
    }
  }

  return {
    generatedAt,
    since,
    available: true,
    truncated,
    totalCalls: rows.length,
    toolCalls: rows.filter((row) => row.event_type === 'tool_call').length,
    actionReady: rows.filter((row) => row.action_ready).length,
    attributedCommerce: attributable.size,
    liveCommerce: [...attributable.values()].filter((record) => record.live).length,
    clients: [...clientCounts.entries()]
      .map(([family, calls]) => ({ family, calls }))
      .sort((left, right) => right.calls - left.calls || left.family.localeCompare(right.family)),
    tools: [...toolCounts.entries()]
      .map(([name, counts]) => ({ name, ...counts }))
      .sort((left, right) => right.calls - left.calls || left.name.localeCompare(right.name)),
    registry,
    endpoint,
  }
}
