import 'server-only'
import { getImportUrlError, getResolvedImportUrlError, safeFetch } from '../importer'
import { parseRobotsForAgentBots, type AgentBot, type CrawlabilitySignals } from '../crawlability'

const SCAN_UA = 'Nexez Agent Readiness Scanner/2.0 (+https://nexez.ai/scan)'

export const HTML_BYTE_CAP = 512 * 1024
export const ROBOTS_BYTE_CAP = 64 * 1024
export const JSON_BYTE_CAP = 256 * 1024

export async function readBodyCapped(res: Response, maxBytes: number): Promise<string | null> {
  const body = res.body
  if (!body) {
    try {
      const text = await res.text()
      return text.length > maxBytes ? text.slice(0, maxBytes) : text
    } catch {
      return null
    }
  }

  const reader = body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: false })
  let out = ''
  let bytes = 0
  try {
    while (bytes < maxBytes) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      const remaining = maxBytes - bytes
      const chunk = value.byteLength > remaining ? value.subarray(0, remaining) : value
      bytes += chunk.byteLength
      out += decoder.decode(chunk, { stream: true })
    }
    out += decoder.decode()
    return out
  } catch {
    return null
  } finally {
    try {
      await reader.cancel()
    } catch {
      // The stream may already be closed.
    }
  }
}

export function stripHtmlToText(html: string, maxChars = 8000): string {
  const text = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#(?:39|x27);/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > maxChars ? text.slice(0, maxChars) : text
}

export function normalizeScanUrl(input: string): string | null {
  let value = (input || '').trim()
  if (!value) return null
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`
  try {
    return new URL(value).toString()
  } catch {
    return null
  }
}

type JsonRecord = Record<string, unknown>

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function collectJsonNodes(value: unknown, output: JsonRecord[], depth = 0) {
  if (depth > 12 || output.length >= 1000) return
  if (Array.isArray(value)) {
    for (const item of value) collectJsonNodes(item, output, depth + 1)
    return
  }
  if (!isRecord(value)) return
  output.push(value)
  for (const child of Object.values(value)) collectJsonNodes(child, output, depth + 1)
}

function schemaTypes(node: JsonRecord): string[] {
  const raw = node['@type']
  const values = Array.isArray(raw) ? raw : raw ? [raw] : []
  return values
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.split(/[\/#:]/).filter(Boolean).at(-1) || value)
}

const BUSINESS_TYPES = new Set([
  'Organization', 'Corporation', 'LocalBusiness', 'ProfessionalService', 'Store',
  'OnlineBusiness', 'FinancialService', 'HomeAndConstructionBusiness', 'MedicalBusiness',
  'LegalService', 'FoodEstablishment', 'TravelAgency', 'RealEstateAgent', 'EducationalOrganization',
])
const OFFER_TYPES = new Set(['Offer', 'AggregateOffer', 'Product', 'Service'])

export type StructuredEvidence = {
  hasJsonLd: boolean
  validJsonLd: boolean
  schemaTypes: string[]
  hasBusinessIdentity: boolean
  hasOfferSchema: boolean
  hasStructuredPrice: boolean
  hasStructuredAction: boolean
  hasStructuredAvailability: boolean
  hasOfferDetails: boolean
  hasStructuredContact: boolean
  hasStructuredPolicies: boolean
  dates: string[]
}

/** Parse bounded JSON-LD scripts and derive concrete schema evidence. */
export function extractStructuredEvidence(html: string): StructuredEvidence {
  const parsedRoots: unknown[] = []
  let scriptCount = 0
  const scripts = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi
  let match: RegExpExecArray | null
  while ((match = scripts.exec(html)) && scriptCount < 100) {
    const attributes = match[1] || ''
    if (!/\btype\s*=\s*(?:["']application\/ld\+json[^"']*["']|application\/ld\+json)/i.test(attributes)) continue
    scriptCount += 1
    const raw = (match[2] || '')
      .trim()
      .replace(/^<!--/, '')
      .replace(/-->$/, '')
      .replace(/^\/\*<!\[CDATA\[\*\//, '')
      .replace(/\/\*\]\]>\*\/$/, '')
      .trim()
    try {
      parsedRoots.push(JSON.parse(raw))
    } catch {
      // Presence and validity are reported separately.
    }
  }

  const nodes: JsonRecord[] = []
  for (const root of parsedRoots) collectJsonNodes(root, nodes)
  const types = Array.from(new Set(nodes.flatMap(schemaTypes)))
  const offerNodes = nodes.filter((node) => schemaTypes(node).some((type) => OFFER_TYPES.has(type)))
  const hasValue = (value: unknown) => value !== null && value !== undefined && String(value).trim() !== ''
  const hasAny = (node: JsonRecord, keys: string[]) => keys.some((key) => hasValue(node[key]))

  return {
    hasJsonLd: scriptCount > 0,
    validJsonLd: parsedRoots.length > 0,
    schemaTypes: types,
    hasBusinessIdentity: nodes.some((node) =>
      schemaTypes(node).some((type) => BUSINESS_TYPES.has(type) || type.endsWith('Business')) && hasValue(node.name),
    ),
    hasOfferSchema: offerNodes.length > 0,
    hasStructuredPrice: offerNodes.length > 0 && nodes.some((node) =>
      hasAny(node, ['price', 'lowPrice', 'highPrice', 'minPrice', 'maxPrice', 'priceRange']),
    ),
    hasStructuredAction: nodes.some((node) => {
      const isAction = schemaTypes(node).some((type) => type.endsWith('Action'))
      const isOffer = schemaTypes(node).some((type) => OFFER_TYPES.has(type))
      return (isAction && hasAny(node, ['target', 'url'])) || (isOffer && hasAny(node, ['url', 'potentialAction']))
    }),
    hasStructuredAvailability: nodes.some((node) =>
      hasAny(node, ['availability', 'availabilityStarts', 'availabilityEnds', 'openingHours', 'openingHoursSpecification', 'deliveryLeadTime']),
    ),
    hasOfferDetails: offerNodes.some((node) =>
      hasValue(node.name) && hasAny(node, ['description', 'serviceType', 'category', 'sku', 'itemOffered']),
    ),
    hasStructuredContact: nodes.some((node) =>
      hasAny(node, ['contactPoint', 'email', 'telephone', 'address', 'customerService']),
    ),
    hasStructuredPolicies: nodes.some((node) =>
      hasAny(node, ['hasMerchantReturnPolicy', 'merchantReturnPolicy', 'termsOfService', 'publishingPrinciples', 'refundType']),
    ),
    dates: nodes
      .flatMap((node) => ['dateModified', 'datePublished', 'uploadDate'].map((key) => node[key]))
      .filter((value): value is string => typeof value === 'string'),
  }
}

function hasRecentDate(values: Array<string | null | undefined>): boolean {
  const now = Date.now()
  const maxAge = 400 * 24 * 60 * 60 * 1000
  return values.some((value) => {
    if (!value) return false
    const time = Date.parse(value)
    return Number.isFinite(time) && time <= now + 24 * 60 * 60 * 1000 && now - time <= maxAge
  })
}

function hasActionLink(html: string): boolean {
  const anchors = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi
  let match: RegExpExecArray | null
  while ((match = anchors.exec(html))) {
    const href = match[1]?.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1]?.trim() || ''
    const label = stripHtmlToText(match[2] || '', 180)
    if (!href || href === '#' || /^javascript:/i.test(href)) continue
    if (/\b(buy|book|schedule|checkout|order|subscribe|request (?:a )?quote|get started|hire|apply|reserve|sign up|launch|deploy (?:your )?listing|list (?:your )?offers)\b/i.test(label)) return true
  }
  return /<form\b[^>]*\baction\s*=\s*["'][^"'#]+["']/i.test(html)
}

function recordLooksMeaningful(value: unknown, kind: 'agent' | 'agent-card' | 'mcp' | 'openapi'): boolean {
  if (!isRecord(value)) return false
  if (kind === 'openapi') return typeof value.openapi === 'string' && isRecord(value.paths)
  if (kind === 'agent-card') {
    return typeof value.name === 'string' && ['skills', 'capabilities', 'url'].some((key) => key in value)
  }
  if (kind === 'mcp') return ['servers', 'tools', 'resources', 'capabilities', 'pages', 'mcp'].some((key) => key in value)
  return typeof value.name === 'string' && ['offers', 'skills', 'capabilities', 'url', 'endpoints'].some((key) => key in value)
}

const SAFE_FETCH_OPTIONS = { timeoutMs: 6500, pinnedDns: true, standardPortsOnly: true } as const

async function probeJson(url: string, kind: 'agent' | 'agent-card' | 'mcp' | 'openapi'): Promise<boolean> {
  const res = await safeFetch(
    url,
    { headers: { 'User-Agent': SCAN_UA, Accept: 'application/json' } },
    SAFE_FETCH_OPTIONS,
  )
  if (!res || !res.ok) return false
  const text = await readBodyCapped(res, JSON_BYTE_CAP)
  if (!text) return false
  try {
    return recordLooksMeaningful(JSON.parse(text), kind)
  } catch {
    return false
  }
}

async function fetchCapped(url: string, maxBytes: number): Promise<string | null> {
  const res = await safeFetch(url, { headers: { 'User-Agent': SCAN_UA } }, SAFE_FETCH_OPTIONS)
  if (!res || !res.ok) return null
  const text = await readBodyCapped(res, maxBytes)
  return text && text.trim().length >= 20 ? text : null
}

async function fetchPage(url: string): Promise<{ status: number; ms: number; html: string; lastModified: string | null; finalUrl: string }> {
  const started = Date.now()
  const res = await safeFetch(
    url,
    { headers: { 'User-Agent': SCAN_UA, Accept: 'text/html,application/xhtml+xml' } },
    SAFE_FETCH_OPTIONS,
  )
  const ms = Date.now() - started
  if (!res) return { status: 0, ms, html: '', lastModified: null, finalUrl: url }
  const html = res.ok ? (await readBodyCapped(res, HTML_BYTE_CAP)) || '' : ''
  return { status: res.status, ms, html, lastModified: res.headers.get('last-modified'), finalUrl: res.url || url }
}

export type SiteSignalsResult = {
  url: string
  origin: string
  elapsedMs: number
  signals: CrawlabilitySignals
  robots: Record<AgentBot, boolean>
  /** Capped public page text for the gated LLM pass. Never returned by anonymous routes. */
  pageText: string
}

export async function gatherSiteSignals(rawUrl: string): Promise<SiteSignalsResult | { error: string }> {
  const url = normalizeScanUrl(rawUrl)
  if (!url) return { error: 'A valid URL is required' }

  const urlError = getImportUrlError(url) || await getResolvedImportUrlError(url, { useCache: false, failClosed: true })
  if (urlError) return { error: urlError }

  const parsedUrl = new URL(url)
  if (parsedUrl.port && !((parsedUrl.protocol === 'https:' && parsedUrl.port === '443') || (parsedUrl.protocol === 'http:' && parsedUrl.port === '80'))) {
    return { error: 'The scanner supports standard HTTP and HTTPS ports only.' }
  }

  const started = Date.now()
  // Resolve the canonical page first. Artifact probes must use the final origin,
  // otherwise a common apex-to-www redirect produces false missing-file results.
  const page = await fetchPage(url)
  const finalUrl = page.finalUrl
  const finalParsedUrl = new URL(finalUrl)
  const origin = finalParsedUrl.origin
  const [agentJsonOk, wellKnownAgentJsonOk, wellKnownAgentCardOk, mcpJsonOk, openApiJsonOk, llmsTxt, robotsTxt] = await Promise.all([
    probeJson(`${origin}/agent.json`, 'agent'),
    probeJson(`${origin}/.well-known/agent.json`, 'agent'),
    probeJson(`${origin}/.well-known/agent-card.json`, 'agent-card'),
    probeJson(`${origin}/.well-known/mcp.json`, 'mcp'),
    probeJson(`${origin}/openapi.json`, 'openapi'),
    fetchCapped(`${origin}/llms.txt`, JSON_BYTE_CAP),
    fetchCapped(`${origin}/robots.txt`, ROBOTS_BYTE_CAP),
  ])

  const html = page.html
  const lower = html.toLowerCase()
  const visibleText = stripHtmlToText(html, 50_000)
  const structured = extractStructuredEvidence(html)
  const robots = parseRobotsForAgentBots(robotsTxt)
  const metaDate = html.match(/<meta[^>]+(?:property|name)=["'](?:article:modified_time|date|last-modified)["'][^>]+content=["']([^"']+)["']/i)?.[1]

  const signals: CrawlabilitySignals = {
    status: page.status,
    responseMs: page.ms,
    https: finalParsedUrl.protocol === 'https:',
    hasJsonLd: structured.hasJsonLd,
    validJsonLd: structured.validJsonLd,
    schemaTypes: structured.schemaTypes,
    hasTitle: /<title[\s>]/i.test(html),
    hasMetaDescription: /<meta[^>]+name=["']description["']/i.test(html),
    hasH1: /<h1[\s>]/i.test(html),
    hasBusinessIdentity: structured.hasBusinessIdentity,
    hasOfferSchema: structured.hasOfferSchema,
    hasStructuredPrice: structured.hasStructuredPrice,
    hasVisiblePrice: /(?:[$€£¥]\s?\d[\d,.]*|\b(?:USD|EUR|GBP|CAD|AUD|NGN|JPY)\s?\d[\d,.]*|\d[\d,.]*\s?(?:USD|EUR|GBP|CAD|AUD|NGN|JPY)\b)/i.test(visibleText),
    hasActionPath: hasActionLink(html),
    hasStructuredAction: structured.hasStructuredAction,
    hasStructuredAvailability: structured.hasStructuredAvailability,
    hasVisibleAvailability: /\b(book now|schedule|availability|available|in stock|shipping|delivery|appointment|opening hours|reserve)\b/i.test(visibleText),
    hasOfferDetails: structured.hasOfferDetails,
    hasContact: structured.hasStructuredContact || /(?:href=["'](?:mailto:|tel:)|href=["'][^"']*\/(?:contact|support)(?:[\/?#"']))/i.test(lower),
    hasPolicies: structured.hasStructuredPolicies || /href=["'][^"']*\/(?:privacy|terms|refund|returns?|cancellation)(?:[\/?#"'])/i.test(lower),
    hasFreshnessSignal: hasRecentDate([...structured.dates, metaDate, page.lastModified]),
    agentJsonOk,
    wellKnownAgentJsonOk,
    wellKnownAgentCardOk,
    mcpJsonOk,
    openApiJsonOk,
    llmsTxtOk: Boolean(llmsTxt),
    robots,
  }

  return {
    url: finalUrl,
    origin,
    elapsedMs: Date.now() - started,
    signals,
    robots,
    pageText: stripHtmlToText(html),
  }
}
