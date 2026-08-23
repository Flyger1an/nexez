export const NEXEZ_DEFAULT_BASE_URL = 'https://nexez.app'
export const NEXEZ_SDK_VERSION = '0.3.1'
export const NEXEZ_DEFAULT_TIMEOUT_MS = 15_000
export const NEXEZ_DEFAULT_WAIT_TIMEOUT_MS = 30_000
export const NEXEZ_DEFAULT_POLL_INTERVAL_MS = 1_000

const NEXEZ_MAX_REQUEST_TIMEOUT_MS = 10 * 60_000
const NEXEZ_MAX_WAIT_TIMEOUT_MS = 5 * 60_000
const NEXEZ_MIN_POLL_INTERVAL_MS = 1_000
const NEXEZ_MAX_POLL_INTERVAL_MS = 30_000

export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }
export type JsonObject = { [key: string]: JsonValue }

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

export type NexezRequestOptions = {
  /** Cancels the in-flight request. */
  signal?: AbortSignal
  /** Per-request timeout. Defaults to the client's timeout (15 seconds by default). */
  timeoutMs?: number
}

export type NexezActionOptions = NexezRequestOptions & {
  /** Stable high-entropy key used to collapse a retried checkout or negotiation action. */
  idempotencyKey?: string
}

export type NexezClientOptions = {
  /** Public Nexez agent runtime. Defaults to https://nexez.app. Paths are preserved for proxy deployments. */
  baseUrl?: string
  /** Custom fetch implementation for tests, workers, or agent runtimes. */
  fetch?: FetchLike
  /** Optional agent identifier forwarded in JSON bodies where supported. */
  buyerAgent?: string
  /** Default timeout for each HTTP request. Defaults to 15 seconds. */
  timeoutMs?: number
}

export type SearchOptions = NexezRequestOptions & {
  limit?: number
  location?: string
  category?: DirectoryCategory
  industry?: string
  minReadiness?: number
  minTrust?: number
  verified?: boolean
  nexezCheckoutReady?: boolean
  /** @deprecated Use nexezCheckoutReady for settlement readiness. This legacy
   * filter means only that an offer exposes some buyer action or handoff. */
  supportsCheckout?: boolean
  supportsNegotiation?: boolean
  priceBand?: NexezMarketplacePriceBand
  /** Coordinate context echoed by the API; coordinates do not currently filter results. */
  lat?: number
  /** Coordinate context echoed by the API; coordinates do not currently filter results. */
  lng?: number
}

export type DirectoryCategory = 'all' | 'professional' | 'consumer'
export type NexezMarketplacePriceBand = 'free' | 'under_100' | '100_500' | '500_2000' | '2000_plus' | 'custom'

export type DirectoryOptions = NexezRequestOptions & {
  query?: string
  category?: DirectoryCategory
  minReadiness?: number
  location?: string
  /** Coordinate context echoed by the API; coordinates do not currently filter results. */
  lat?: number
  /** Coordinate context echoed by the API; coordinates do not currently filter results. */
  lng?: number
}

export type NexezLocationFilter = {
  active: boolean
  query: string | null
  lat: number | null
  lng: number | null
  matching: string
}

export type NexezSearchUsage = {
  method: 'GET'
  example: string
  note: string
}

export type NexezSearchResponse = {
  schema_version: 'nexez.agent-search.v1'
  ranking_policy: 'nexez.discovery-ranking.v1'
  generated_at: string
  query: string
  filters?: {
    category: DirectoryCategory
    industry: string | null
    min_readiness: number | null
    min_trust: number | null
    verified: boolean | null
    nexez_checkout_ready: boolean | null
    supports_checkout: boolean | null
    supports_negotiation: boolean | null
    price_band: NexezMarketplacePriceBand | null
  }
  result_count: number
  search_url?: string
  location_filter: NexezLocationFilter
  results: NexezSearchResult[]
  usage?: NexezSearchUsage
}

export type NexezDirectoryEntry = {
  name: string
  slug: string
  description: string | null
  url: string
  agent_json_url: string
  readiness: number
  industry: string | null
  location: string | null
  audience: string | null
  offer_count: number
  last_booking_at: string | null
  has_recent_activity: boolean
  custom_domain: string | null
  agent_optimized: boolean
  prefer_original_default: boolean
  trust_score: number
  verified: boolean
  has_credentials: boolean
  rating_summary: NexezRatingSummary | null
  marketplace: JsonObject
  location_match: NexezLocationMatch | null
  storefront?: NexezStorefrontReference
}

export type NexezDirectoryResponse = {
  schema_version: 'nexez.directory.v2'
  count: number
  filters: {
    category: DirectoryCategory
    q: string | null
    min_readiness: number | null
    location: string | null
  }
  location_filter: NexezLocationFilter
  marketplace: JsonObject
  results: NexezDirectoryEntry[]
  note: string
}

export type NexezStorefrontReference = {
  handle: string
  url: string
  agent_json_url: string
}

export type NexezReviewTag = {
  label: string
  count: number
}

export type NexezPublicReview = {
  id: string
  rating: 1 | 2 | 3 | 4 | 5
  title: string | null
  body: string | null
  tags: string[]
  createdAt: string
}

export type NexezRatingSummary = {
  average: number
  count: number
  verified_count: number
  reputation_score: number
  distribution: Record<'1' | '2' | '3' | '4' | '5', number>
  recent_positive_tags: NexezReviewTag[]
  recent_reviews?: NexezPublicReview[]
}

export type NexezMarketplaceSummary = {
  readiness: number
  trust_score: number
  offer_count: number
  category: 'professional' | 'consumer'
  industry: string | null
  verified: boolean
  certified: boolean
  has_credentials: boolean
  has_recent_activity: boolean
  /** At least one published offer exposes a buyer action or provider handoff. */
  has_actionable_offer: boolean
  /** Private payout state confirms Nexez can settle an actionable offer. */
  nexez_checkout_ready: boolean
  /** @deprecated Compatibility alias for has_actionable_offer. */
  supports_checkout: boolean
  /** Offer configuration plus the owner's current plan entitlement. */
  supports_negotiation: boolean
  price_band: NexezMarketplacePriceBand
  badges: string[]
}

export type NexezLocationMatch = {
  active: boolean
  query: string | null
  matched: boolean
  confidence: number
  mode: 'text' | 'broad' | 'none'
  matched_values: string[]
}

export type NexezSearchRankingEvidence = {
  policy_version: 'nexez.discovery-ranking.v1'
  relevance: number
  location: 'not-requested' | 'exact-or-service-area' | 'broad' | 'unmatched'
  availability: 'listing-only' | 'available' | 'limited' | 'unspecified' | 'sold-out'
  actionability: 'transaction-ready' | 'needs-confirmation' | 'listing-only' | 'unavailable'
  seller_verified: boolean
  agent_ready_certified: boolean
  verified_purchase_reviews: number
  reputation: number | null
  review_evidence: 'cold-start' | 'established-positive' | 'established-neutral' | 'established-concerning'
  readiness: number
  freshness: 'recent' | 'current' | 'stale' | 'unknown'
}

export type NexezSearchResult = {
  score: number
  matched_query_terms: string[]
  match_reasons: string[]
  ranking?: NexezSearchRankingEvidence
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
    storefront?: NexezStorefrontReference
    rating_summary?: NexezRatingSummary | null
  }
  marketplace?: NexezMarketplaceSummary
  location_match?: NexezLocationMatch | null
  offer: NexezOfferSearchResult | null
}

export type NexezCheckoutAction = {
  method: 'POST'
  endpoint: string
  content_type: 'application/json'
  body: { slug: string; offer: string }
  optional_fields?: Record<string, string>
  dry_run_body: { slug: string; offer: string; dryRun: true }
}

export type NexezOfferSearchResult = {
  key: string
  type: 'service' | 'product'
  name: string
  description: string | null
  price: string | null
  checkout_url: string
  provider_url: string | null
  action: NexezCheckoutAction
}

export type AgentPageContact = {
  preferred: 'email' | 'cta' | 'website' | null
  value: string | null
  channels: Array<'email' | 'cta' | 'website'>
}

export type AgentAvailabilityWindow = {
  date: string
  start?: string
  end?: string
  label?: string
}

export type AgentPageAvailability = {
  next_available: string | null
  last_booking: JsonValue | null
  source: string | null
  note: string
  windows: AgentAvailabilityWindow[] | null
}

export type AgentPageCertification = {
  certified: boolean
  level: 'agent-ready' | null
  readiness: number
  label: string | null
}

export type AgentPageManifest = {
  schema_version: 'nexez.agent-page.v1'
  generated_at: string
  last_updated: string | null
  page: {
    name: string
    slug: string
    url: string
    agent_json_url: string
    currency: string
    description: string | null
    website_url: string | null
    cta_url: string | null
    cta_label: string | null
    audience: string | null
    location: string | null
    contact_email: string | null
    contact: AgentPageContact
    rating_summary: NexezRatingSummary | null
    availability: AgentPageAvailability
    llms_url: string
    openapi_url: string
  }
  offers: AgentPageOffer[]
  faqs: JsonObject[]
  recommended_actions: string[]
  plain_text: string
  storefront?: NexezStorefrontReference
  /** @deprecated Removed from the manifest on 2026-08-16. Owner-authored notes
   *  were never intended for buyers and are no longer projected publicly. The
   *  key is absent from responses; this field remains only so existing readers
   *  keep type-checking. */
  memory_context?: JsonValue | null
  certification: AgentPageCertification
}

export type AgentOfferConsumer = {
  duration: string | null
  serviceArea: string | null
  isMobile: boolean
  travelFee: string | null
}

export type NexezNegotiationAction = {
  method: 'POST'
  endpoint: string
  content_type: 'application/json'
  body: {
    slug: string
    offer: string
    buyerAgent: string
    query: string
    requestedTerms: JsonObject
    budget: string
    timeline: string
    contact: string
  }
  dry_run_body: { slug: string; offer: string; dryRun: true }
  states: NegotiationStatus[]
  escrow_note: string
  status_check: {
    method: 'GET'
    endpoint: string
    note: string
  }
}

export type AgentPageOffer = {
  key: string
  type: 'service' | 'product'
  name: string
  description: string | null
  voice_summary: string | null
  price: string | null
  currency: string
  provider_url: string | null
  checkout_url: string
  prefer_original_for_this: boolean
  availability: string
  offer_type: 'fixed' | 'negotiable'
  accepts_negotiation: boolean
  min_notice_hours?: number
  blackout_dates?: string[]
  max_bookings_per_week?: number
  action: NexezCheckoutAction
  negotiation_action?: NexezNegotiationAction
  consumer: AgentOfferConsumer
}

export type CheckoutInput = {
  slug: string
  offer: string
  query?: string
  buyerEmail?: string
  buyerName?: string
  buyerReference?: string
  buyerAgent?: string
  /** Short-lived token returned by validateCheckout for this exact payload. */
  approvalToken?: string
}

/** @deprecated Use CheckoutInput. */
export type CheckoutValidationInput = CheckoutInput

export type ApprovedCheckoutInput = CheckoutInput & {
  /** Explicit buyer consent required before a checkout or provider handoff starts. */
  userApproved: true
}

export type CheckoutValidationResponse = {
  ok: boolean
  provider: 'stripe_ready' | 'provider_ready' | 'needs_connect' | 'needs_stripe_key' | 'needs_checkout_url' | string
  checkoutUrl: string
  actionUrl: string | null
  currency: string
  stripeConfigured: boolean
  connectReady: boolean
  events: Record<string, boolean>
  approvalTokenRequired?: boolean
  approvalToken?: string
  approvalExpiresAt?: string
  error?: string
  code?: string
}

export type CheckoutStartResponse = {
  url: string
  provider: string
  checkoutSessionId?: string
  events?: Record<string, boolean>
}

export type NegotiationInput = {
  slug: string
  offer: string
  buyerAgent?: string
  query?: string
  requestedTerms?: JsonObject
  budget?: string
  timeline?: string
  contact?: string
  negotiationId?: string
  statusToken?: string
  /** Short-lived token returned by validateNegotiation for this exact payload. */
  approvalToken?: string
}

export type ApprovedNegotiationInput = NegotiationInput & {
  /** Explicit buyer consent required before a proposal is submitted. */
  userApproved: true
}

export type NegotiationRuleDecision = 'auto_accept' | 'review' | 'flag'

export type NegotiationRulesEvaluation = {
  decision: NegotiationRuleDecision
  /** Stable machine-readable reason codes such as offer_not_negotiable or below_min_price. */
  reasons: string[]
}

export type NegotiationDryRunResponse = {
  ok: boolean
  dryRun: true
  rulesEvaluation: NegotiationRulesEvaluation
  publicPageUrl: string
  /** Human-readable branch guidance added by the SDK for a rejected validation. */
  reason?: string
  error?: string
  approvalTokenRequired?: boolean
  approvalToken?: string
  approvalExpiresAt?: string
}

export type NegotiationStatus =
  | 'negotiation'
  | 'agreement_proposed'
  | 'held'
  | 'complete'
  | 'declined'
  | 'expired'
  | 'refunded'
  | 'disputed'

export type NegotiationEscrowMode =
  | 'not_configured'
  | 'manual_capture_ready'
  | 'manual_capture_created'
  | 'captured'

export type NegotiationSettlementState = 'auto' | 'awaiting_approval' | 'approved'
export type NegotiationDecisionAction = 'accept' | 'counter' | 'reject' | 'clarify' | 'review'

export type NegotiationDecisionScope = {
  included?: string
  excluded?: string
  maxRevisions?: number
  maxProjectWeeks?: number
}

export type NegotiationDecision = {
  action: NegotiationDecisionAction
  reasoning: string
  counter?: {
    priceCents?: number
    price?: string
    proposedDate?: string
    scopeNotes?: string
    scope?: NegotiationDecisionScope
  }
  clarificationQuestions?: string[]
  schedulingLink?: string
  scope?: NegotiationDecisionScope
}

export type NegotiationStatusInput = {
  negotiationId: string
  statusToken: string
}

export type WaitForNegotiationDecisionInput = NegotiationStatusInput & {
  /** Overall polling deadline. Defaults to 30 seconds and is capped at 5 minutes. */
  timeoutMs?: number
  /** Delay between status requests. Defaults to 1 second. */
  intervalMs?: number
  /** Cancels the current request and any pending polling delay. */
  signal?: AbortSignal
}

export type NegotiationStatusResponse = {
  id: string
  status: NegotiationStatus
  statusLabel: string
  offer: string
  amountCents: number | null
  settlementState: NegotiationSettlementState | null
  payable: boolean
  decisionPending: boolean
  decisionSeq: number
  decision: NegotiationDecision | null
  updatedAt: string | null
  next: string
}

export type NegotiationSubmitResponse = {
  ok: true
  status: NegotiationStatus
  decisionPending: true
  negotiationId: string
  persistentLink: string
  negotiationUrl: string
  escrowMode: NegotiationEscrowMode
  stripeConfigured: boolean
  publicPageUrl: string
  next: string
  message: string
  replayed?: boolean
  idempotencyKeyAccepted?: boolean
  statusToken?: string
  statusUrl?: string
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

export class NexezApprovalError extends Error {
  readonly status = 403
  readonly action: 'checkout' | 'negotiation'

  constructor(action: 'checkout' | 'negotiation') {
    super(`${action === 'checkout' ? 'startCheckout' : 'submitNegotiation'} requires explicit buyer approval: userApproved must be true.`)
    this.name = 'NexezApprovalError'
    this.action = action
  }
}

export class NexezTimeoutError extends Error {
  readonly timeoutMs: number
  readonly url?: string

  constructor(message: string, timeoutMs: number, url?: string) {
    super(message)
    this.name = 'NexezTimeoutError'
    this.timeoutMs = timeoutMs
    this.url = url
  }
}

type InternalRequestOptions = NexezRequestOptions & {
  method?: 'GET' | 'POST'
  body?: Record<string, unknown>
  idempotencyKey?: string
}

export class NexezClient {
  readonly baseUrl: string
  private readonly fetchImpl: FetchLike
  private readonly buyerAgent?: string
  private readonly requestTimeoutMs: number

  constructor(options: NexezClientOptions = {}) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl ?? NEXEZ_DEFAULT_BASE_URL)
    this.fetchImpl = options.fetch ?? getGlobalFetch()
    if (options.buyerAgent != null) assertClientLabel(options.buyerAgent, 'buyerAgent')
    this.buyerAgent = options.buyerAgent
    this.requestTimeoutMs = normalizeDuration(
      options.timeoutMs ?? NEXEZ_DEFAULT_TIMEOUT_MS,
      'timeoutMs',
      1,
      NEXEZ_MAX_REQUEST_TIMEOUT_MS,
    )
  }

  async search(query: string, options: SearchOptions = {}): Promise<NexezSearchResponse> {
    const url = this.resolveUrl('api/agent-search')
    url.searchParams.set('q', query)
    if (options.limit != null) url.searchParams.set('limit', String(options.limit))
    if (options.location) url.searchParams.set('location', options.location)
    if (options.category) url.searchParams.set('category', options.category)
    if (options.industry) url.searchParams.set('industry', options.industry)
    if (options.minReadiness != null) url.searchParams.set('min_readiness', String(options.minReadiness))
    if (options.minTrust != null) url.searchParams.set('min_trust', String(options.minTrust))
    if (options.verified != null) url.searchParams.set('verified', String(options.verified))
    if (options.nexezCheckoutReady != null) url.searchParams.set('nexez_checkout_ready', String(options.nexezCheckoutReady))
    if (options.supportsCheckout != null) url.searchParams.set('supports_checkout', String(options.supportsCheckout))
    if (options.supportsNegotiation != null) url.searchParams.set('supports_negotiation', String(options.supportsNegotiation))
    if (options.priceBand) url.searchParams.set('price_band', options.priceBand)
    if (options.lat != null) url.searchParams.set('lat', String(options.lat))
    if (options.lng != null) url.searchParams.set('lng', String(options.lng))

    return this.request<NexezSearchResponse>(url, options)
  }

  async browseDirectory(options: DirectoryOptions = {}): Promise<NexezDirectoryResponse> {
    const url = this.resolveUrl('api/directory')
    if (options.query) url.searchParams.set('q', options.query)
    if (options.category) url.searchParams.set('category', options.category)
    if (options.minReadiness != null) url.searchParams.set('min_readiness', String(options.minReadiness))
    if (options.location) url.searchParams.set('location', options.location)
    if (options.lat != null) url.searchParams.set('lat', String(options.lat))
    if (options.lng != null) url.searchParams.set('lng', String(options.lng))

    return this.request<NexezDirectoryResponse>(url, options)
  }

  async getAgentPage(slug: string, options: NexezRequestOptions = {}): Promise<AgentPageManifest> {
    assertSlug(slug)
    return this.request<AgentPageManifest>(this.resolveUrl(`${encodeURIComponent(slug)}/agent.json`), options)
  }

  async validateCheckout(
    input: CheckoutInput,
    options: NexezRequestOptions = {},
  ): Promise<CheckoutValidationResponse> {
    return this.request<CheckoutValidationResponse>(this.resolveUrl('api/checkout'), {
      ...options,
      method: 'POST',
      body: {
        ...input,
        buyerAgent: input.buyerAgent ?? this.buyerAgent,
        dryRun: true,
      },
    })
  }

  async startCheckout(
    input: ApprovedCheckoutInput,
    options: NexezActionOptions = {},
  ): Promise<CheckoutStartResponse> {
    assertApproved(input.userApproved, 'checkout')
    const { userApproved: _userApproved, ...checkout } = input
    return this.request<CheckoutStartResponse>(this.resolveUrl('api/checkout'), {
      ...options,
      method: 'POST',
      idempotencyKey: options.idempotencyKey,
      body: {
        ...checkout,
        buyerAgent: checkout.buyerAgent ?? this.buyerAgent,
        dryRun: false,
      },
    })
  }

  async validateNegotiation(
    input: NegotiationInput,
    options: NexezRequestOptions = {},
  ): Promise<NegotiationDryRunResponse> {
    const result = await this.request<NegotiationDryRunResponse>(this.resolveUrl('api/negotiations'), {
      ...options,
      method: 'POST',
      body: {
        ...input,
        buyerAgent: input.buyerAgent ?? this.buyerAgent,
        dryRun: true,
      },
    })

    const reasons = result.rulesEvaluation?.reasons
    if (Array.isArray(reasons) && reasons.includes('offer_not_negotiable')) {
      return {
        ...result,
        ok: false,
        reason: 'This offer does not accept negotiation. Use checkout at the listed price.',
      }
    }

    return result
  }

  async submitNegotiation(
    input: ApprovedNegotiationInput,
    options: NexezActionOptions = {},
  ): Promise<NegotiationSubmitResponse> {
    assertApproved(input.userApproved, 'negotiation')
    const { userApproved: _userApproved, ...proposal } = input
    return this.request<NegotiationSubmitResponse>(this.resolveUrl('api/negotiations'), {
      ...options,
      method: 'POST',
      idempotencyKey: options.idempotencyKey,
      body: {
        ...proposal,
        buyerAgent: proposal.buyerAgent ?? this.buyerAgent,
        dryRun: false,
      },
    })
  }

  async getNegotiationStatus(
    input: NegotiationStatusInput,
    options: NexezRequestOptions = {},
  ): Promise<NegotiationStatusResponse> {
    assertOpaqueValue(input.negotiationId, 'negotiation id')
    assertOpaqueValue(input.statusToken, 'status token')
    const url = this.resolveUrl('api/negotiations/status')
    url.searchParams.set('id', input.negotiationId)
    url.searchParams.set('token', input.statusToken)
    const result = await this.request<NegotiationStatusResponse>(url, options)
    if (typeof result.decisionPending !== 'boolean') {
      throw new NexezApiError(
        'Nexez returned an invalid negotiation status response: decisionPending must be boolean.',
        200,
        redactSensitiveUrl(url),
        result,
      )
    }
    return result
  }

  async waitForNegotiationDecision(
    input: WaitForNegotiationDecisionInput,
  ): Promise<NegotiationStatusResponse> {
    const timeoutMs = normalizeDuration(
      input.timeoutMs ?? NEXEZ_DEFAULT_WAIT_TIMEOUT_MS,
      'timeoutMs',
      1,
      NEXEZ_MAX_WAIT_TIMEOUT_MS,
    )
    const intervalMs = normalizeDuration(
      input.intervalMs ?? NEXEZ_DEFAULT_POLL_INTERVAL_MS,
      'intervalMs',
      NEXEZ_MIN_POLL_INTERVAL_MS,
      NEXEZ_MAX_POLL_INTERVAL_MS,
    )
    const startedAt = Date.now()

    while (true) {
      throwIfAborted(input.signal)
      const elapsedMs = Date.now() - startedAt
      const remainingMs = timeoutMs - elapsedMs
      if (remainingMs <= 0) throw waitTimeoutError(timeoutMs)

      const status = await this.getNegotiationStatus(input, {
        signal: input.signal,
        timeoutMs: Math.min(this.requestTimeoutMs, remainingMs),
      })
      if (!status.decisionPending) return status

      const delayMs = Math.min(intervalMs, timeoutMs - (Date.now() - startedAt))
      if (delayMs <= 0) throw waitTimeoutError(timeoutMs)
      await abortableDelay(delayMs, input.signal)
    }
  }

  private resolveUrl(path: string): URL {
    return new URL(path.replace(/^\/+/, ''), `${this.baseUrl}/`)
  }

  private async request<T>(url: URL, options: InternalRequestOptions = {}): Promise<T> {
    const timeoutMs = normalizeDuration(
      options.timeoutMs ?? this.requestTimeoutMs,
      'timeoutMs',
      1,
      NEXEZ_MAX_REQUEST_TIMEOUT_MS,
    )
    const headers: Record<string, string> = {
      accept: 'application/json',
      'x-nexez-client': `typescript-sdk/${NEXEZ_SDK_VERSION}`,
    }
    if (options.body) headers['content-type'] = 'application/json'
    const requestBuyerAgent = typeof options.body?.buyerAgent === 'string' ? options.body.buyerAgent : this.buyerAgent
    if (requestBuyerAgent) headers['x-nexez-buyer-agent'] = requestBuyerAgent
    if (options.idempotencyKey) headers['idempotency-key'] = normalizeIdempotencyKey(options.idempotencyKey)

    const response = await fetchWithControls(
      this.fetchImpl,
      url,
      {
        method: options.method ?? 'GET',
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
      },
      options.signal,
      timeoutMs,
    )
    const body = await readBody(response)
    const safeUrl = redactSensitiveUrl(url)

    if (!response.ok) {
      const message = getErrorMessage(body) || `Nexez request failed with status ${response.status}`
      throw new NexezApiError(message, response.status, safeUrl, body)
    }

    if (!isJsonObject(body)) {
      throw new NexezApiError('Nexez returned an invalid JSON object response.', response.status, safeUrl, body)
    }

    return body as T
  }
}

export function createNexezClient(options?: NexezClientOptions) {
  return new NexezClient(options)
}

export function searchNexez(
  query: string,
  options?: SearchOptions & NexezClientOptions,
): Promise<NexezSearchResponse> {
  const { baseUrl, fetch, buyerAgent, timeoutMs, signal, ...searchOptions } = options ?? {}
  return new NexezClient({ baseUrl, fetch, buyerAgent, timeoutMs }).search(query, {
    ...searchOptions,
    signal,
    timeoutMs,
  })
}

export function browseDirectory(
  options?: DirectoryOptions & NexezClientOptions,
): Promise<NexezDirectoryResponse> {
  const { baseUrl, fetch, buyerAgent, timeoutMs, signal, ...directoryOptions } = options ?? {}
  return new NexezClient({ baseUrl, fetch, buyerAgent, timeoutMs }).browseDirectory({
    ...directoryOptions,
    signal,
    timeoutMs,
  })
}

export function getAgentPage(
  slug: string,
  options?: NexezClientOptions & NexezRequestOptions,
): Promise<AgentPageManifest> {
  const { client, request } = splitCallOptions(options)
  return client.getAgentPage(slug, request)
}

export function validateCheckout(
  input: CheckoutInput,
  options?: NexezClientOptions & NexezRequestOptions,
): Promise<CheckoutValidationResponse> {
  const { client, request } = splitCallOptions(options)
  return client.validateCheckout(input, request)
}

export function startCheckout(
  input: ApprovedCheckoutInput,
  options?: NexezClientOptions & NexezActionOptions,
): Promise<CheckoutStartResponse> {
  const { client, request } = splitActionCallOptions(options)
  return client.startCheckout(input, request)
}

export function validateNegotiation(
  input: NegotiationInput,
  options?: NexezClientOptions & NexezRequestOptions,
): Promise<NegotiationDryRunResponse> {
  const { client, request } = splitCallOptions(options)
  return client.validateNegotiation(input, request)
}

export function submitNegotiation(
  input: ApprovedNegotiationInput,
  options?: NexezClientOptions & NexezActionOptions,
): Promise<NegotiationSubmitResponse> {
  const { client, request } = splitActionCallOptions(options)
  return client.submitNegotiation(input, request)
}

export function getNegotiationStatus(
  input: NegotiationStatusInput,
  options?: NexezClientOptions & NexezRequestOptions,
): Promise<NegotiationStatusResponse> {
  const { client, request } = splitCallOptions(options)
  return client.getNegotiationStatus(input, request)
}

export function waitForNegotiationDecision(
  input: WaitForNegotiationDecisionInput,
  options?: NexezClientOptions,
): Promise<NegotiationStatusResponse> {
  return new NexezClient(options).waitForNegotiationDecision(input)
}

function splitCallOptions(options?: NexezClientOptions & NexezRequestOptions) {
  const { baseUrl, fetch, buyerAgent, timeoutMs, signal } = options ?? {}
  return {
    client: new NexezClient({ baseUrl, fetch, buyerAgent, timeoutMs }),
    request: { timeoutMs, signal },
  }
}

function splitActionCallOptions(options?: NexezClientOptions & NexezActionOptions) {
  const { baseUrl, fetch, buyerAgent, timeoutMs, signal, idempotencyKey } = options ?? {}
  return {
    client: new NexezClient({ baseUrl, fetch, buyerAgent, timeoutMs }),
    request: { timeoutMs, signal, idempotencyKey },
  }
}

function getGlobalFetch(): FetchLike {
  if (typeof globalThis.fetch !== 'function') {
    throw new Error('Nexez SDK requires fetch. Pass a custom fetch implementation in createNexezClient({ fetch }).')
  }
  return globalThis.fetch.bind(globalThis) as FetchLike
}

async function fetchWithControls(
  fetchImpl: FetchLike,
  url: URL,
  init: RequestInit,
  externalSignal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<Response> {
  throwIfAborted(externalSignal)
  const controller = new AbortController()
  const safeUrl = redactSensitiveUrl(url)
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined
  let externalAbort: (() => void) | undefined

  const control = new Promise<never>((_resolve, reject) => {
    timeoutHandle = setTimeout(() => {
      const error = new NexezTimeoutError(`Nexez request timed out after ${timeoutMs}ms.`, timeoutMs, safeUrl)
      controller.abort(error)
      reject(error)
    }, timeoutMs)

    if (externalSignal) {
      externalAbort = () => {
        const error = getAbortReason(externalSignal)
        controller.abort(error)
        reject(error as Error)
      }
      externalSignal.addEventListener('abort', externalAbort, { once: true })
    }
  })

  try {
    return await Promise.race([
      fetchImpl(url.toString(), { ...init, signal: controller.signal }),
      control,
    ])
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle)
    if (externalSignal && externalAbort) externalSignal.removeEventListener('abort', externalAbort)
  }
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

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function getErrorMessage(body: unknown) {
  if (body && typeof body === 'object' && 'error' in body) {
    const error = (body as { error?: unknown }).error
    if (typeof error === 'string') return error
  }
  return ''
}

function normalizeBaseUrl(value: string) {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(`Invalid Nexez baseUrl: ${value}`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Nexez baseUrl must use http or https.')
  }
  if (url.username || url.password) {
    throw new Error('Nexez baseUrl must not include credentials.')
  }
  if (url.search || url.hash) {
    throw new Error('Nexez baseUrl must not include a query string or fragment.')
  }
  const path = url.pathname.replace(/\/+$/, '')
  return `${url.origin}${path === '/' ? '' : path}`
}

function assertSlug(value: string) {
  if (
    typeof value !== 'string' ||
    value.length > 160 ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
  ) {
    throw new Error(`Invalid Nexez slug: ${value}`)
  }
}

function assertOpaqueValue(value: string, label: string) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 2_048 ||
    value.trim() !== value ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new Error(`Invalid Nexez ${label}.`)
  }
}

function assertClientLabel(value: string, label: string) {
  if (!value || value.length > 120 || value.trim() !== value || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`Invalid Nexez ${label}.`)
  }
}

function normalizeIdempotencyKey(value: string) {
  const key = typeof value === 'string' ? value.trim() : ''
  if (!/^[A-Za-z0-9._~:-]{16,255}$/.test(key)) {
    throw new Error('Nexez idempotencyKey must contain 16 to 255 safe token characters.')
  }
  return key
}

function assertApproved(value: unknown, action: 'checkout' | 'negotiation'): asserts value is true {
  if (value !== true) throw new NexezApprovalError(action)
}

function normalizeDuration(value: number, label: string, min: number, max: number) {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new RangeError(`Nexez ${label} must be between ${min} and ${max} milliseconds.`)
  }
  return Math.floor(value)
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw getAbortReason(signal)
}

function getAbortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('The operation was aborted.', 'AbortError')
}

function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal)
  if (!signal) return new Promise((resolve) => setTimeout(resolve, ms))

  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timeoutHandle)
      signal.removeEventListener('abort', onAbort)
      reject(getAbortReason(signal))
    }
    const timeoutHandle = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

function waitTimeoutError(timeoutMs: number) {
  return new NexezTimeoutError(
    `Nexez negotiation decision was still pending after ${timeoutMs}ms.`,
    timeoutMs,
  )
}

function redactSensitiveUrl(url: URL) {
  const safe = new URL(url)
  if (safe.searchParams.has('token')) safe.searchParams.set('token', '[redacted]')
  return safe.toString()
}
