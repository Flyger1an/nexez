import { classifyMcpClient, type McpClientFamily } from './mcp-demand'

export const MCP_PROTOCOL_VERSION = '2026-07-28'
export const MCP_LEGACY_PROTOCOL_VERSION = '2025-11-25'
export const MCP_LEGACY_SUPPORTED_VERSIONS = [
  '2025-11-25',
  '2025-06-18',
  '2025-03-26',
  '2024-11-05',
] as const
export const MCP_SUPPORTED_VERSIONS = [MCP_PROTOCOL_VERSION] as const

export type McpJsonRpcRequest = {
  jsonrpc?: string
  id?: string | number | null
  method?: string
  params?: Record<string, unknown>
}

export type McpTransportError = {
  status: number
  body: {
    jsonrpc: '2.0'
    id: string | number | null
    error: { code: number; message: string; data?: Record<string, unknown> }
  }
}

export type McpTransportValidation =
  | { ok: true; modern: boolean; clientFamily: McpClientFamily }
  | { ok: false; modern: boolean; clientFamily: McpClientFamily; error: McpTransportError }

const ALLOWED_PRODUCTION_ORIGINS = new Set([
  'https://nexez.app',
  'https://nexez.ai',
  'https://app.nexez.ai',
])
const MODERN_META_VERSION = 'io.modelcontextprotocol/protocolVersion'
const MODERN_META_CLIENT = 'io.modelcontextprotocol/clientInfo'
const BASE64_SENTINEL = /^=\?base64\?([A-Za-z0-9+/]*={0,2})\?=$/

export function isAllowedMcpOrigin(origin: string | null): boolean {
  if (!origin) return true
  if (ALLOWED_PRODUCTION_ORIGINS.has(origin)) return true
  try {
    const url = new URL(origin)
    return (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]')
      && (url.protocol === 'http:' || url.protocol === 'https:')
  } catch {
    return false
  }
}

export function validateMcpRequest(
  request: Request,
  body: McpJsonRpcRequest,
): McpTransportValidation {
  const id = body.id ?? null
  const params = isRecord(body.params) ? body.params : {}
  const meta = isRecord(params._meta) ? params._meta : {}
  const modernVersion = stringValue(meta[MODERN_META_VERSION])
  const protocolHeader = request.headers.get('mcp-protocol-version')
  const modern = Boolean(
    modernVersion
    || body.method === 'server/discover'
    || protocolHeader === MCP_PROTOCOL_VERSION,
  )
  const clientInfo = modern
    ? (isRecord(meta[MODERN_META_CLIENT]) ? meta[MODERN_META_CLIENT].name : null)
    : (isRecord(params.clientInfo) ? params.clientInfo.name : request.headers.get('user-agent'))
  const clientFamily = classifyMcpClient(clientInfo)

  if (
    body.jsonrpc !== '2.0'
    || typeof body.method !== 'string'
    || !body.method
    || (body.params !== undefined && !isRecord(body.params))
    || !validJsonRpcId(body.id)
  ) {
    return failure(modern, clientFamily, id, -32600, 'Invalid JSON-RPC request.')
  }

  if (!modern) {
    if (protocolHeader && !isLegacyProtocolVersion(protocolHeader)) {
      return failure(
        false,
        clientFamily,
        id,
        -32022,
        'Unsupported MCP protocol version.',
        {
          supported: [...MCP_SUPPORTED_VERSIONS, ...MCP_LEGACY_SUPPORTED_VERSIONS],
          requested: protocolHeader,
        },
      )
    }
    return { ok: true, modern: false, clientFamily }
  }

  if (!protocolHeader || !modernVersion) {
    return failure(true, clientFamily, id, -32020, 'MCP protocol version header and body metadata are required.')
  }
  if (protocolHeader !== modernVersion) {
    return failure(true, clientFamily, id, -32020, 'MCP protocol version header does not match the request body.')
  }
  if (modernVersion !== MCP_PROTOCOL_VERSION) {
    return failure(
      true,
      clientFamily,
      id,
      -32022,
      'Unsupported MCP protocol version.',
      { supported: [...MCP_SUPPORTED_VERSIONS], requested: modernVersion },
    )
  }

  const method = stringValue(body.method)
  if (!method || request.headers.get('mcp-method') !== method) {
    return failure(true, clientFamily, id, -32020, 'Mcp-Method header is required and must match the request body.')
  }

  const expectedName = method === 'tools/call'
    ? stringValue(params.name)
    : method === 'resources/read'
      ? stringValue(params.uri)
      : null
  const nameHeader = request.headers.get('mcp-name')
  if (expectedName !== null) {
    const decoded = decodeMcpHeaderValue(nameHeader)
    if (!decoded.ok || decoded.value !== expectedName) {
      return failure(true, clientFamily, id, -32020, 'Mcp-Name header is required and must match the request body.')
    }
  } else if (nameHeader !== null) {
    return failure(true, clientFamily, id, -32020, 'Mcp-Name header does not belong on this request.')
  }

  const accept = request.headers.get('accept') || ''
  if (!accept.includes('application/json') || !accept.includes('text/event-stream')) {
    return failure(true, clientFamily, id, -32600, 'Accept must include application/json and text/event-stream.')
  }

  return { ok: true, modern: true, clientFamily }
}

export function negotiateLegacyMcpProtocolVersion(value: unknown): string {
  return typeof value === 'string' && isLegacyProtocolVersion(value)
    ? value
    : MCP_LEGACY_PROTOCOL_VERSION
}

function failure(
  modern: boolean,
  clientFamily: McpClientFamily,
  id: string | number | null,
  code: number,
  message: string,
  data?: Record<string, unknown>,
): McpTransportValidation {
  return {
    ok: false,
    modern,
    clientFamily,
    error: {
      status: 400,
      body: { jsonrpc: '2.0', id, error: { code, message, ...(data ? { data } : {}) } },
    },
  }
}

function decodeMcpHeaderValue(value: string | null): { ok: true; value: string } | { ok: false } {
  if (value === null) return { ok: false }
  const sentinel = BASE64_SENTINEL.exec(value)
  if (!sentinel) {
    if (value.startsWith('=?base64?') || value.endsWith('?=')) return { ok: false }
    return { ok: true, value }
  }
  try {
    const bytes = Buffer.from(sentinel[1], 'base64')
    if (bytes.toString('base64') !== sentinel[1]) return { ok: false }
    return { ok: true, value: bytes.toString('utf8') }
  } catch {
    return { ok: false }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null
}

function isLegacyProtocolVersion(value: string): boolean {
  return (MCP_LEGACY_SUPPORTED_VERSIONS as readonly string[]).includes(value)
}

function validJsonRpcId(value: unknown): boolean {
  return value === undefined
    || value === null
    || typeof value === 'string'
    || (typeof value === 'number' && Number.isInteger(value))
}
