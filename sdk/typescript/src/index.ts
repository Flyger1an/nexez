export const NEXEZ_DEFAULT_BASE_URL = 'https://nexez.app'

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

export type NexezClientOptions = {
  /** Public Nexez agent runtime. Defaults to https://nexez.app. */
  baseUrl?: string
  /** Custom fetch implementation for tests, workers, or agent runtimes. */
  fetch?: FetchLike
  /** Optional user-agent-ish identifier forwarded in JSON bodies where supported. */
  buyerAgent?: string
}

export type SearchOptions = {
  limit?: number
  location?: string
  lat?: number
  lng?: number
}

export type NexezSearchResponse = {
  schema_version: 'nexez.agent-search.v1' | string
  generated_at: string
  query: string
  result_count: number
  search_url?: string
  location_filter?: unknown
  results: NexezSearchResult[]
  usage?: unknown
}

export type NexezSearchResult = {
  score: number
  source?: { id: string; label: string }
  page: {
    name: string
    slug: string
    url: string
    agent_json_url: string
    description: string | null
    audience: string | null
    location: string | null
    contact_email: string | null
    industry?: string | null
    website_url?: string | null
    cta_url?: string | null
  }
  marketplace?: unknown
  location_match?: unknown
  offer: NexezOfferSearchResult | null
}

export type NexezOfferSearchResult = {
  key: string
  type: 'service' | 'product'
  name: string
  description: string | null
  price: string | null
  checkout_url: string
  provider_url: string | null
  action: {
    method: 'POST'
    endpoint: string
    content_type: 'application/json'
    body: { slug: string; offer: string }
    dry_run_body: { slug: string; offer: string; dryRun: true }
  }
}

export type AgentPageManifest = {
  schema_version: 'nexez.agent-page.v1' | string
  generated_at: string
  last_updated?: string | null
  page: {
    name: string
    slug: string
    url: string
    agent_json_url: string
    currency?: string
    description?: string | null
    website_url?: string | null
    cta_url?: string | null
    cta_label?: string | null
    audience?: string | null
    location?: string | null
    contact_email?: string | null
    contact?: unknown
    availability?: unknown
    llms_url?: string
  }
  offers: AgentPageOffer[]
  faqs?: Array<Record<string, unknown>>
  recommended_actions?: string[]
  plain_text?: string
  memory_context?: unknown
  certification?: unknown
}

export type AgentPageOffer = {
  key: string
  type: 'service' | 'product'
  name: string
  description: string | null
  voice_summary?: string | null
  price: string | null
  currency?: string
  provider_url: string | null
  checkout_url: string
  prefer_original_for_this?: boolean
  availability?: string
  action?: unknown
  negotiation_action?: unknown
  consumer?: unknown
}

export type CheckoutValidationInput = {
  slug: string
  offer: string
  query?: string
  buyerEmail?: string
  buyerName?: string
  buyerReference?: string
  buyerAgent?: string
}

export type CheckoutValidationResponse = {
  ok: boolean
  provider?: string
  checkoutUrl?: string
  actionUrl?: string | null
  currency?: string
  stripeConfigured?: boolean
  connectReady?: boolean
  events?: Record<string, boolean>
  error?: string
  code?: string
}

export type NegotiationInput = {
  slug: string
  offer: string
  buyerAgent?: string
  query?: string
  requestedTerms?: Record<string, unknown>
  budget?: string
  timeline?: string
  contact?: string
  negotiationId?: string
  statusToken?: string
}

export type NegotiationDryRunResponse = {
  ok: boolean
  dryRun: true
  rulesEvaluation?: unknown
  publicPageUrl?: string
  error?: string
}

export type NegotiationSubmitResponse = {
  ok: boolean
  status?: string
  decisionPending?: boolean
  negotiationId?: string
  persistentLink?: string
  negotiationUrl?: string
  escrowMode?: string
  stripeConfigured?: boolean
  publicPageUrl?: string
  next?: string
  message?: string
  statusToken?: string
  statusUrl?: string
  error?: string
}

export class NexezApiError extends Error {
  readonly status: number
  readonly body: unknown
  readonly url: string

  constructor(message: string, status: number, url: string, body: unknown) {
    super(message)
    this.name = 'NexezApiError'
    this.status = status
    this.url = url
    this.body = body
  }
}

export class NexezClient {
  readonly baseUrl: string
  private readonly fetchImpl: FetchLike
  private readonly buyerAgent?: string

  constructor(options: NexezClientOptions = {}) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl ?? NEXEZ_DEFAULT_BASE_URL)
    this.fetchImpl = options.fetch ?? getGlobalFetch()
    this.buyerAgent = options.buyerAgent
  }

  async search(query: string, options: SearchOptions = {}): Promise<NexezSearchResponse> {
    const url = new URL('/api/agent-search', this.baseUrl)
    url.searchParams.set('q', query)
    if (options.limit != null) url.searchParams.set('limit', String(options.limit))
    if (options.location) url.searchParams.set('location', options.location)
    if (options.lat != null) url.searchParams.set('lat', String(options.lat))
    if (options.lng != null) url.searchParams.set('lng', String(options.lng))

    return this.request<NexezSearchResponse>(url)
  }

  async getAgentPage(slug: string): Promise<AgentPageManifest> {
    assertPathSegment(slug, 'slug')
    return this.request<AgentPageManifest>(new URL(`/${encodeURIComponent(slug)}/agent.json`, this.baseUrl))
  }

  async validateCheckout(input: CheckoutValidationInput): Promise<CheckoutValidationResponse> {
    return this.request<CheckoutValidationResponse>(new URL('/api/checkout', this.baseUrl), {
      method: 'POST',
      body: {
        ...input,
        buyerAgent: input.buyerAgent ?? this.buyerAgent,
        dryRun: true,
      },
    })
  }

  async validateNegotiation(input: NegotiationInput): Promise<NegotiationDryRunResponse> {
    return this.request<NegotiationDryRunResponse>(new URL('/api/negotiations', this.baseUrl), {
      method: 'POST',
      body: {
        ...input,
        buyerAgent: input.buyerAgent ?? this.buyerAgent,
        dryRun: true,
      },
    })
  }

  async submitNegotiation(input: NegotiationInput): Promise<NegotiationSubmitResponse> {
    return this.request<NegotiationSubmitResponse>(new URL('/api/negotiations', this.baseUrl), {
      method: 'POST',
      body: {
        ...input,
        buyerAgent: input.buyerAgent ?? this.buyerAgent,
      },
    })
  }

  private async request<T>(url: URL, options: { method?: string; body?: Record<string, unknown> } = {}): Promise<T> {
    const response = await this.fetchImpl(url.toString(), {
      method: options.method ?? 'GET',
      headers: options.body
        ? {
            accept: 'application/json',
            'content-type': 'application/json',
          }
        : { accept: 'application/json' },
      body: options.body ? JSON.stringify(options.body) : undefined,
    })
    const body = await readBody(response)

    if (!response.ok) {
      const message = getErrorMessage(body) || `Nexez request failed with status ${response.status}`
      throw new NexezApiError(message, response.status, url.toString(), body)
    }

    return body as T
  }
}

export function createNexezClient(options?: NexezClientOptions) {
  return new NexezClient(options)
}

export function searchNexez(query: string, options?: SearchOptions & NexezClientOptions) {
  const { baseUrl, fetch, buyerAgent, ...searchOptions } = options ?? {}
  return new NexezClient({ baseUrl, fetch, buyerAgent }).search(query, searchOptions)
}

export function getAgentPage(slug: string, options?: NexezClientOptions) {
  return new NexezClient(options).getAgentPage(slug)
}

export function validateCheckout(input: CheckoutValidationInput, options?: NexezClientOptions) {
  return new NexezClient(options).validateCheckout(input)
}

export function validateNegotiation(input: NegotiationInput, options?: NexezClientOptions) {
  return new NexezClient(options).validateNegotiation(input)
}

export function submitNegotiation(input: NegotiationInput, options?: NexezClientOptions) {
  return new NexezClient(options).submitNegotiation(input)
}

function getGlobalFetch(): FetchLike {
  if (typeof globalThis.fetch !== 'function') {
    throw new Error('Nexez SDK requires fetch. Pass a custom fetch implementation in createNexezClient({ fetch }).')
  }
  return globalThis.fetch.bind(globalThis) as FetchLike
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function getErrorMessage(body: unknown) {
  if (body && typeof body === 'object' && 'error' in body) {
    const error = (body as { error?: unknown }).error
    if (typeof error === 'string') return error
  }
  return ''
}

function normalizeBaseUrl(value: string) {
  const url = new URL(value)
  return url.origin
}

function assertPathSegment(value: string, label: string) {
  if (!value || value.includes('/') || value.includes('?') || value.includes('#')) {
    throw new Error(`Invalid Nexez ${label}: ${value}`)
  }
}
