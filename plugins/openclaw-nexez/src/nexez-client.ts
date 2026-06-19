export type NexezPluginConfig = {
  baseUrl?: string
  userAgent?: string
}

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue }

type QueryValue = string | number | boolean | null | undefined

export class NexezApiError extends Error {
  readonly status: number
  readonly url: string
  readonly body: string

  constructor(message: string, status: number, url: string, body: string) {
    super(message)
    this.name = 'NexezApiError'
    this.status = status
    this.url = url
    this.body = body
  }
}

export function resolveBaseUrl(config?: NexezPluginConfig) {
  const raw = config?.baseUrl || process.env.NEXEZ_BASE_URL || 'https://nexez.app'
  const parsed = new URL(raw)
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Nexez baseUrl must use http or https.')
  }
  return parsed.origin + parsed.pathname.replace(/\/$/, '')
}

export async function searchAgentPages(
  params: {
    query?: string
    location?: string
    limit?: number
    lat?: number
    lng?: number
  },
  config?: NexezPluginConfig,
  signal?: AbortSignal,
) {
  return requestJson('/api/agent-search', {
    query: {
      q: params.query || '',
      location: params.location,
      limit: clampLimit(params.limit, 10),
      lat: params.lat,
      lng: params.lng,
    },
    signal,
  }, config)
}

export async function browseDirectory(
  params: {
    query?: string
    location?: string
    category?: 'all' | 'professional' | 'consumer'
    minReadiness?: number
    lat?: number
    lng?: number
  },
  config?: NexezPluginConfig,
  signal?: AbortSignal,
) {
  return requestJson('/api/directory', {
    query: {
      q: params.query || undefined,
      location: params.location,
      category: params.category || 'all',
      min_readiness: clampReadiness(params.minReadiness),
      lat: params.lat,
      lng: params.lng,
    },
    signal,
  }, config)
}

export async function getAgentPage(
  params: { slug: string },
  config?: NexezPluginConfig,
  signal?: AbortSignal,
) {
  return requestJson(`/${encodeURIComponent(params.slug)}/agent.json`, { signal }, config)
}

export async function validateCheckout(
  params: CheckoutInput,
  config?: NexezPluginConfig,
  signal?: AbortSignal,
) {
  return postJson('/api/checkout', { ...params, dryRun: true, buyerAgent: params.buyerAgent || 'openclaw' }, config, signal)
}

export async function startCheckout(
  params: CheckoutInput & { userApproved: boolean },
  config?: NexezPluginConfig,
  signal?: AbortSignal,
) {
  assertApproved(params.userApproved, 'checkout')
  return postJson('/api/checkout', { ...params, dryRun: false, buyerAgent: params.buyerAgent || 'openclaw' }, config, signal)
}

export async function validateNegotiation(
  params: NegotiationInput,
  config?: NexezPluginConfig,
  signal?: AbortSignal,
) {
  return postJson('/api/negotiations', { ...params, dryRun: true, buyerAgent: params.buyerAgent || 'openclaw' }, config, signal)
}

export async function submitNegotiation(
  params: NegotiationInput & { userApproved: boolean },
  config?: NexezPluginConfig,
  signal?: AbortSignal,
) {
  assertApproved(params.userApproved, 'negotiation')
  return postJson('/api/negotiations', { ...params, dryRun: false, buyerAgent: params.buyerAgent || 'openclaw' }, config, signal)
}

type CheckoutInput = {
  slug: string
  offer: string
  query?: string
  buyerEmail?: string
  buyerName?: string
  buyerReference?: string
  buyerAgent?: string
}

type NegotiationInput = {
  slug: string
  offer: string
  query?: string
  budget?: string
  timeline?: string
  contact?: string
  buyerAgent?: string
  requestedTerms?: Record<string, JsonValue>
}

async function postJson(
  path: string,
  body: Record<string, unknown>,
  config?: NexezPluginConfig,
  signal?: AbortSignal,
) {
  return requestJson(path, {
    method: 'POST',
    body,
    signal,
  }, config)
}

async function requestJson(
  path: string,
  options: {
    method?: 'GET' | 'POST'
    query?: Record<string, QueryValue>
    body?: Record<string, unknown>
    signal?: AbortSignal
  },
  config?: NexezPluginConfig,
) {
  const url = new URL(`${resolveBaseUrl(config)}${path}`)
  for (const [key, value] of Object.entries(options.query || {})) {
    if (value !== null && value !== undefined && value !== '') {
      url.searchParams.set(key, String(value))
    }
  }

  const response = await fetch(url, {
    method: options.method || 'GET',
    signal: options.signal,
    headers: {
      Accept: 'application/json',
      'User-Agent': config?.userAgent || 'OpenClaw Nexez Plugin',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })

  const text = await response.text()
  if (!response.ok) {
    throw new NexezApiError(`Nexez request failed with ${response.status}.`, response.status, url.toString(), text.slice(0, 1000))
  }

  try {
    return JSON.parse(text)
  } catch {
    throw new NexezApiError('Nexez returned a non-JSON response.', response.status, url.toString(), text.slice(0, 1000))
  }
}

function clampLimit(value: number | undefined, fallback: number) {
  if (!Number.isFinite(value)) return fallback
  return Math.max(1, Math.min(50, Math.floor(value as number)))
}

function clampReadiness(value: number | undefined) {
  if (!Number.isFinite(value)) return undefined
  return Math.max(0, Math.min(100, Math.floor(value as number)))
}

function assertApproved(userApproved: boolean, action: string) {
  if (userApproved !== true) {
    throw new Error(`Refusing to start ${action}. The tool input must include userApproved: true after explicit user approval.`)
  }
}
