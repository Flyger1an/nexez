/**
 * Nexez Site Importer (Phase 1 A - Production Grade)
 *
 * Robust, industry-aware, multi-page website analyzer.
 * Returns rich OfferItem[] ready for direct population of VisualOfferBuilder cards.
 *
 * Goals from ROADMAP:
 * - Multi-path parallel crawling (primary + common service/pricing paths)
 * - Strong schema.org + heuristic extraction with consumer fields (duration, mobile, area, travelFee)
 * - Industry-aware seeding + confidence scoring
 * - No data loss handoff to builder
 * - Abort/timeout safe, conservative to avoid rate limits
 */

import dns from 'node:dns/promises'
import net from 'node:net'
import { getReadinessScore, normalizeSlug, type FaqItem, type OfferItem } from './agent-page'
import { getIndustryBoostKeywords, industrySeeds } from './industry-catalog'
import { isLlmConfigured, llmCompleteDetailed, llmModel, llmProviderName, type LlmCompletionResult } from './llm'

/**
 * Phase 6: optional LLM fallback for ambiguous pages. Strips the page to text
 * and asks the model to extract offers as JSON. Dormant unless LLM_API_KEY is
 * set; always best-effort (returns [] on any failure).
 */
export type ImportGuidance = {
  industry?: string | null
  targetBuyer?: string | null
  desiredAction?: string | null
  offerFocus?: string | null
  notes?: string | null
  location?: string | null
  clarifyingAnswers?: ImportClarifyingAnswer[] | null
}

export type ImportClarifyingAnswer = {
  id?: string | null
  field?: string | null
  question: string
  answer: string
}

export type ImportSourceKind =
  | 'input_url'
  | 'common_path'
  | 'sitemap'
  | 'llms_txt'
  | 'agent_json'
  | 'schema_org'
  | 'heuristic'
  | 'shopify'
  | 'llm'
  | 'template'
  | 'guidance'

export type ImportSource = {
  url: string
  label: string
  type: ImportSourceKind
  method: string
}

export type ImportClarifyingQuestion = {
  id: string
  field: 'audience' | 'offers' | 'pricing' | 'action' | 'location' | 'contact'
  question: string
  why: string
}

export type ImportReadiness = {
  score: number
  strengths: string[]
  gaps: string[]
}

export type ImportAiStatus = {
  configured: boolean
  attempted: boolean
  used: boolean
  status: 'deterministic' | 'structured_ai' | 'offer_ai' | 'fallback' | 'failed'
  provider: string
  model: string
  reason: string
  latencyMs?: number
  httpStatus?: number
}

type CrawledDoc = {
  url: string
  label: string
  type: 'html' | 'llms_txt' | 'agent_json'
  text: string
  html?: string
}

type StructuredAiDraft = {
  title?: string
  description?: string
  audience?: string
  industry?: string
  location?: string
  cta_label?: string
  cta_url?: string
  offers?: OfferItem[]
  faqs?: FaqItem[]
  clarifyingQuestions?: ImportClarifyingQuestion[]
  reviewNotes?: string[]
}

type AiDraftAttempt = {
  draft: StructuredAiDraft | null
  completion?: LlmCompletionResult
  skippedReason?: string
  parseStatus?: 'parsed' | 'invalid_json' | 'no_usable_fields' | 'no_completion'
}

type AiOfferAttempt = {
  offers: OfferItem[]
  completion?: LlmCompletionResult
  skippedReason?: string
  parseStatus?: 'parsed' | 'invalid_json' | 'not_array' | 'no_completion'
}

function normalizeGuidance(input?: string | ImportGuidance | null): ImportGuidance {
  if (!input) return {}
  if (typeof input === 'string') return { industry: input }
  return {
    industry: input.industry?.trim() || null,
    targetBuyer: input.targetBuyer?.trim() || null,
    desiredAction: input.desiredAction?.trim() || null,
    offerFocus: input.offerFocus?.trim() || null,
    notes: input.notes?.trim() || null,
    location: input.location?.trim() || null,
    clarifyingAnswers: Array.isArray(input.clarifyingAnswers)
      ? input.clarifyingAnswers
          .map((item) => ({
            id: typeof item.id === 'string' ? item.id.trim().slice(0, 80) : null,
            field: typeof item.field === 'string' ? item.field.trim().slice(0, 40) : null,
            question: typeof item.question === 'string' ? item.question.trim().slice(0, 220) : '',
            answer: typeof item.answer === 'string' ? item.answer.trim().slice(0, 500) : '',
          }))
          .filter((item) => item.question && item.answer)
          .slice(0, 6)
      : null,
  }
}

function guidanceCacheKey(url: string, guidance: ImportGuidance): string {
  const key = {
    llm: isLlmConfigured() ? `${llmProviderName()}:${llmModel()}` : 'deterministic',
    industry: guidance.industry || '',
    targetBuyer: guidance.targetBuyer || '',
    desiredAction: guidance.desiredAction || '',
    offerFocus: guidance.offerFocus || '',
    notes: guidance.notes || '',
    location: guidance.location || '',
    clarifyingAnswers: guidance.clarifyingAnswers?.map((item) => ({
      id: item.id || '',
      question: item.question,
      answer: item.answer,
    })) || [],
  }
  return `${normalizeUrl(url, '/')}::${JSON.stringify(key)}`
}

function formatClarifyingAnswers(guidance: ImportGuidance): string {
  const answers = guidance.clarifyingAnswers?.filter((item) => item.question && item.answer) || []
  return answers
    .map((item) => `Q: ${item.question}\nA: ${item.answer}`)
    .join('\n\n')
}

function combinedGuidanceNotes(guidance: ImportGuidance): string {
  return [guidance.notes || '', formatClarifyingAnswers(guidance)]
    .filter(Boolean)
    .join('\n\n')
    .trim()
}

function answerForField(guidance: ImportGuidance, field: string): string {
  return guidance.clarifyingAnswers?.find((item) => item.field === field && item.answer)?.answer || ''
}

function deterministicAiStatus(reason = 'LLM_API_KEY is not configured.'): ImportAiStatus {
  return {
    configured: isLlmConfigured(),
    attempted: false,
    used: false,
    status: 'deterministic',
    provider: llmProviderName(),
    model: llmModel(),
    reason,
  }
}

function aiStatusFromAttempt(
  attempt: AiDraftAttempt | AiOfferAttempt,
  status: ImportAiStatus['status'],
  used: boolean,
  fallbackReason: string,
): ImportAiStatus {
  const completion = attempt.completion
  const configured = completion?.configured ?? isLlmConfigured()
  const attempted = completion?.attempted ?? false
  const failed = completion && ['http_error', 'network_error'].includes(completion.status)
  const reason = used
    ? 'AI extraction returned usable structured data.'
    : attempt.skippedReason || completion?.error || fallbackReason

  return {
    configured,
    attempted,
    used,
    status: used ? status : failed ? 'failed' : 'fallback',
    provider: completion?.provider || llmProviderName(),
    model: completion?.model || llmModel(),
    reason,
    latencyMs: completion?.latencyMs,
    httpStatus: completion?.httpStatus,
  }
}

export async function llmExtractOffers(html: string, guidance?: string | ImportGuidance | null): Promise<OfferItem[]> {
  const result = await llmExtractOffersWithStatus(html, guidance)
  return result.offers
}

async function llmExtractOffersWithStatus(html: string, guidance?: string | ImportGuidance | null): Promise<AiOfferAttempt> {
  if (!isLlmConfigured()) return { offers: [], skippedReason: 'LLM_API_KEY is not configured.' }
  const context = normalizeGuidance(guidance)
  const userGuidance = combinedGuidanceNotes(context)
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 6000)
  if (text.length < 80) {
    return { offers: [], skippedReason: 'Page text was too short for AI extraction.' }
  }

  const completion = await llmCompleteDetailed(
    [
      'Extract the products or services this business offers from the page text below.',
      'Return ONLY a JSON array of objects with keys: name, price (string, "" if unknown), description (one sentence).',
      'Max 12 items. Do not invent offerings.',
      context.targetBuyer ? `Target buyer: ${context.targetBuyer}.` : '',
      context.offerFocus ? `Prioritize offers related to: ${context.offerFocus}.` : '',
      context.desiredAction ? `Preferred buyer action: ${context.desiredAction}.` : '',
      userGuidance ? `User guidance:\n${userGuidance}` : '',
      `Page text:\n${text}`,
    ].filter(Boolean).join('\n\n'),
    { system: 'You extract structured offer data from web pages for AI agents. Output strictly valid JSON, nothing else.', maxTokens: 1000, temperature: 0.2 },
  )
  if (!completion.text) return { offers: [], completion, parseStatus: 'no_completion' }
  try {
    const json = completion.text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
    const parsed = JSON.parse(json)
    if (!Array.isArray(parsed)) return { offers: [], completion, parseStatus: 'not_array' }
    const offers = parsed
      .filter((o) => o && typeof o.name === 'string' && o.name.trim())
      .slice(0, 12)
      .map((o) => ({
        name: String(o.name).trim().slice(0, 120),
        price: typeof o.price === 'string' ? o.price.slice(0, 40) : '',
        description: typeof o.description === 'string' ? o.description.slice(0, 300) : '',
        url: '',
        source: 'llm',
        confidence: 0.7,
      }))
    return { offers, completion, parseStatus: 'parsed' }
  } catch {
    return { offers: [], completion, parseStatus: 'invalid_json' }
  }
}

function extractJsonObject(value: string): string {
  const trimmed = value.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return trimmed
  return trimmed.slice(start, end + 1)
}

function toStringOrEmpty(value: unknown, max = 300): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

async function llmExtractDraftWithStatus(docs: CrawledDoc[], guidance: ImportGuidance): Promise<AiDraftAttempt> {
  if (!isLlmConfigured()) return { draft: null, skippedReason: 'LLM_API_KEY is not configured.' }
  const userGuidance = combinedGuidanceNotes(guidance)

  const corpus = docs
    .slice(0, 8)
    .map((doc, index) => {
      const body = doc.text || (doc.html ? stripHtml(doc.html, 5000) : '')
      return `SOURCE ${index + 1}: ${doc.label}\nURL: ${doc.url}\nTYPE: ${doc.type}\nTEXT:\n${body.slice(0, 5000)}`
    })
    .join('\n\n---\n\n')

  if (corpus.length < 120) return { draft: null, skippedReason: 'Not enough page text for AI extraction.' }

  const prompt = [
    'Create a Nexez agent-page draft from the supplied business sources.',
    'Return ONLY strict JSON with this exact top-level shape:',
    '{"title":"","description":"","audience":"","industry":"","location":"","cta_label":"","cta_url":"","offers":[{"name":"","price":"","description":"","url":"","duration":"","serviceArea":"","isMobile":false,"travelFee":"","confidence":0.0,"sourceUrl":"","sourceLabel":""}],"faqs":[{"question":"","answer":""}],"clarifyingQuestions":[{"id":"","field":"audience|offers|pricing|action|location|contact","question":"","why":""}],"reviewNotes":[""]}',
    'Rules: do not invent offers. Prefer explicit services, products, packages, pricing, booking actions, and schema data. If uncertain, ask a clarifying question instead of inventing. Keep descriptions factual and one sentence.',
    guidance.targetBuyer ? `Target buyer: ${guidance.targetBuyer}` : '',
    guidance.desiredAction ? `Preferred action: ${guidance.desiredAction}` : '',
    guidance.offerFocus ? `Offer focus: ${guidance.offerFocus}` : '',
    userGuidance ? `User guidance and answered questions:\n${userGuidance}` : '',
    guidance.location ? `Known location/service area: ${guidance.location}` : '',
    `Sources:\n${corpus}`,
  ].filter(Boolean).join('\n\n')

  const completion = await llmCompleteDetailed(prompt, {
    system: 'You extract complete structured business drafts for clean AI-agent-readable pages. Output valid JSON only.',
    maxTokens: 1800,
    temperature: 0.15,
  })

  if (!completion.text) return { draft: null, completion, parseStatus: 'no_completion' }

  try {
    const parsed = JSON.parse(extractJsonObject(completion.text)) as any
    const offers = Array.isArray(parsed.offers)
      ? parsed.offers
          .filter((offer: any) => offer && typeof offer.name === 'string' && offer.name.trim())
          .slice(0, 12)
          .map((offer: any) => {
            const sourceUrl = toStringOrEmpty(offer.sourceUrl, 500)
            const sourceLabel = toStringOrEmpty(offer.sourceLabel, 120) || 'AI extraction'
            const source = sourceFor(sourceUrl || docs[0]?.url || '', 'llm', 'Structured AI extraction', sourceLabel)
            return withProvenance({
              name: toStringOrEmpty(offer.name, 120),
              price: toStringOrEmpty(offer.price, 60) || 'Custom',
              description: toStringOrEmpty(offer.description, 260) || 'Detected offer from the business website.',
              url: toStringOrEmpty(offer.url, 500) || source.url,
              duration: toStringOrEmpty(offer.duration, 60) || undefined,
              serviceArea: toStringOrEmpty(offer.serviceArea, 90) || undefined,
              isMobile: typeof offer.isMobile === 'boolean' ? offer.isMobile : undefined,
              travelFee: toStringOrEmpty(offer.travelFee, 60) || undefined,
              confidence: typeof offer.confidence === 'number' ? Math.min(Math.max(offer.confidence, 0.4), 0.96) : 0.78,
              source: 'llm',
            }, source, 0)
          })
      : []

    const faqs = Array.isArray(parsed.faqs)
      ? parsed.faqs
          .filter((faq: any) => faq && typeof faq.question === 'string' && typeof faq.answer === 'string')
          .slice(0, 5)
          .map((faq: any) => ({
            question: toStringOrEmpty(faq.question, 140),
            answer: toStringOrEmpty(faq.answer, 320),
          }))
      : []

    const clarifyingQuestions = Array.isArray(parsed.clarifyingQuestions)
      ? parsed.clarifyingQuestions
          .filter((question: any) => question && typeof question.question === 'string')
          .slice(0, 4)
          .map((question: any, index: number) => ({
            id: toStringOrEmpty(question.id, 40) || `ai-question-${index + 1}`,
            field: ['audience', 'offers', 'pricing', 'action', 'location', 'contact'].includes(question.field) ? question.field : 'offers',
            question: toStringOrEmpty(question.question, 180),
            why: toStringOrEmpty(question.why, 220) || 'This would improve import accuracy.',
          } as ImportClarifyingQuestion))
      : []

    const draft = {
      title: toStringOrEmpty(parsed.title, 120),
      description: toStringOrEmpty(parsed.description, 600),
      audience: toStringOrEmpty(parsed.audience, 140),
      industry: toStringOrEmpty(parsed.industry, 120),
      location: toStringOrEmpty(parsed.location, 120),
      cta_label: toStringOrEmpty(parsed.cta_label, 40),
      cta_url: toStringOrEmpty(parsed.cta_url, 500),
      offers,
      faqs,
      clarifyingQuestions,
      reviewNotes: Array.isArray(parsed.reviewNotes)
        ? parsed.reviewNotes.filter((note: any) => typeof note === 'string').slice(0, 4)
        : [],
    }

    const hasUsableFields = Boolean(
      draft.title ||
      draft.description ||
      draft.audience ||
      draft.industry ||
      draft.location ||
      draft.cta_label ||
      draft.cta_url ||
      draft.offers?.length ||
      draft.faqs?.length ||
      draft.clarifyingQuestions?.length,
    )

    return hasUsableFields
      ? { draft, completion, parseStatus: 'parsed' }
      : { draft: null, completion, parseStatus: 'no_usable_fields' }
  } catch {
    return { draft: null, completion, parseStatus: 'invalid_json' }
  }
}

export type ImportResult = {
  title: string
  description: string
  website_url: string
  structuredOffers: (OfferItem & { confidence?: number })[]
  servicesText: string // legacy pipe format for compat during transition
  industry?: string | null
  audience?: string | null
  location?: string | null
  cta_label?: string
  cta_url?: string
  faqs?: FaqItem[]
  reviewNotes?: string[]
  confidence?: number
  sources?: ImportSource[]
  clarifyingQuestions?: ImportClarifyingQuestion[]
  readiness?: ImportReadiness
  aiStatus: ImportAiStatus
  pagesAnalyzed: number
  logo_url?: string | null  // one-click logo detection for branding
}

const COMMON_PATHS = [
  '/services',
  '/service',
  '/pricing',
  '/products',
  '/product',
  '/shop',
  '/store',
  '/book',
  '/booking',
  '/appointments',
  '/schedule',
  '/rates',
  '/packages',
  '/contact',
  '/about',
  '/',
]
const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^0(?:\.0){0,3}$/,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^\[?::1\]?$/i,
  /^\[?fc[0-9a-f]{2}:/i,
  /^\[?fd[0-9a-f]{2}:/i,
  /^\[?fe80:/i,
]
const HOST_SAFETY_CACHE = new Map<string, { ts: number; error: string | null }>()
const HOST_SAFETY_TTL_MS = 5 * 60 * 1000

// Simple in-memory short-TTL cache (Phase 5 robustness). Avoids hammering the same site repeatedly.
const IMPORT_CACHE = new Map<string, { ts: number; result: ImportResult }>()
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

function getCached(url: string, guidance: ImportGuidance): ImportResult | null {
  const key = guidanceCacheKey(url, guidance)
  const hit = IMPORT_CACHE.get(key)
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.result
  return null
}
function setCached(url: string, guidance: ImportGuidance, result: ImportResult) {
  const key = guidanceCacheKey(url, guidance)
  IMPORT_CACHE.set(key, { ts: Date.now(), result })
  // crude size limit
  if (IMPORT_CACHE.size > 50) {
    const first = IMPORT_CACHE.keys().next().value
    if (first) IMPORT_CACHE.delete(first)
  }
}

export function getImportUrlError(value: string): string | null {
  let url: URL

  try {
    url = new URL(value)
  } catch {
    return 'Enter a valid website URL, including https://.'
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return 'Website URL must use HTTP or HTTPS.'
  }

  const hostname = url.hostname.toLowerCase()
  if (PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(hostname))) {
    return 'Website URL cannot target localhost, private networks, or link-local addresses.'
  }

  if (!hostname.includes('.')) {
    return 'Website URL must use a public hostname.'
  }

  return null
}

export async function getResolvedImportUrlError(value: string): Promise<string | null> {
  const urlError = getImportUrlError(value)
  if (urlError) return urlError

  const hostname = new URL(value).hostname.toLowerCase()
  const directIp = net.isIP(hostname)
  if (directIp) {
    return isBlockedIpAddress(hostname) ? 'Website URL cannot target localhost, private networks, or link-local addresses.' : null
  }

  const cached = HOST_SAFETY_CACHE.get(hostname)
  if (cached && Date.now() - cached.ts < HOST_SAFETY_TTL_MS) return cached.error

  let error: string | null = null
  try {
    const records = await Promise.race([
      dns.lookup(hostname, { all: true }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('DNS safety lookup timed out')), 1500)),
    ])
    if (records.some((record) => isBlockedIpAddress(record.address))) {
      error = 'Website URL resolved to a private or local network address.'
    }
  } catch {
    // Let the actual fetch surface network/DNS failures; this guard is for confirmed private resolutions.
    error = null
  }

  HOST_SAFETY_CACHE.set(hostname, { ts: Date.now(), error })
  if (HOST_SAFETY_CACHE.size > 100) {
    const first = HOST_SAFETY_CACHE.keys().next().value
    if (first) HOST_SAFETY_CACHE.delete(first)
  }
  return error
}

function isBlockedIpAddress(address: string): boolean {
  const version = net.isIP(address)
  if (version === 4) return isBlockedIpv4(address)
  if (version === 6) return isBlockedIpv6(address)
  return PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(address.toLowerCase()))
}

function isBlockedIpv4(address: string): boolean {
  const [a, b, c] = address.split('.').map((part) => Number(part))
  if ([a, b, c].some((part) => Number.isNaN(part))) return true
  if (a === 0 || a === 10 || a === 127) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 192 && b === 0) return true
  if (a === 198 && (b === 18 || b === 19)) return true
  if (a === 198 && b === 51 && c === 100) return true
  if (a === 203 && b === 0 && c === 113) return true
  if (a >= 224) return true
  return false
}

function isBlockedIpv6(address: string): boolean {
  const normalized = address.toLowerCase()
  // An IPv4-mapped/compatible IPv6 (`::ffff:169.254.169.254`, its hex form
  // `::ffff:a9fe:a9fe`, or the deprecated `::a.b.c.d`) must be judged by the
  // embedded v4 - otherwise a DNS name resolving to a mapped-IPv6 slips the v6
  // prefix checks below and reaches a private/link-local target (SSRF).
  const embedded = embeddedIpv4(normalized)
  if (embedded) return isBlockedIpv4(embedded)

  return normalized === '::1'
    || normalized === '::'
    || normalized.startsWith('fc')
    || normalized.startsWith('fd')
    || normalized.startsWith('fe8')
    || normalized.startsWith('fe9')
    || normalized.startsWith('fea')
    || normalized.startsWith('feb')
}

/** Decode the IPv4 embedded in a v4-mapped/compatible IPv6, or null. */
function embeddedIpv4(normalized: string): string | null {
  // Dotted tail: `::ffff:1.2.3.4` / `::1.2.3.4`.
  const dotted = normalized.match(/^::(?:ffff:)?(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/)
  if (dotted) return dotted[1]!
  // Hex form: `::ffff:aabb:ccdd` -> a.b.c.d.
  const hex = normalized.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
  if (hex) {
    const hi = parseInt(hex[1]!, 16)
    const lo = parseInt(hex[2]!, 16)
    return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`
  }
  return null
}

// Basic robots.txt respect (Phase 5). We only check Disallow for our paths.
// We never crawl aggressively; this is a best-effort filter.
export async function isPathAllowed(base: string, path: string): Promise<boolean> {
  try {
    const robotsUrl = normalizeUrl(base, '/robots.txt')
    // SSRF-safe: validate the target + EVERY redirect hop (a malicious robots.txt
    // 30x to an internal host must not be followed). null = unreadable/unsafe -> allow.
    const txt = await fetchTextSafe(robotsUrl, 4000)
    if (txt === null) return true // no robots or unreadable/unsafe -> allow (we're polite anyway)
    // Very simple parser: look for User-agent: * or our bot, then Disallow lines
    const lines = txt.split('\n').map(l => l.trim().toLowerCase())
    let inRelevant = false
    for (const line of lines) {
      if (line.startsWith('user-agent:')) {
        const ua = line.split(':')[1].trim()
        inRelevant = ua === '*' || ua.includes('nexez') || ua.includes('bot')
      }
      if (inRelevant && line.startsWith('disallow:')) {
        const rule = line.split(':')[1].trim()
        if (rule && (path === rule || path.startsWith(rule))) return false
      }
    }
    return true
  } catch {
    return true
  }
}

// Shopify-specific extraction (high value for user request)
async function tryExtractShopifyProducts(baseUrl: string): Promise<OfferItem[]> {
  const offers: OfferItem[] = []
  try {
    const u = new URL(baseUrl)
    // Common Shopify public endpoint (works on many public stores without auth)
    const shopifyUrl = `${u.origin}/products.json?limit=30`
    // SSRF-safe: validate the target + every redirect hop (a 30x to an internal
    // host must not be followed) before connecting / parsing the JSON body.
    const res = await safeFetch(shopifyUrl, { headers: { 'User-Agent': 'Nexez Site Importer Bot/1.0 (Shopify)' } }, { timeoutMs: 5000 })
    if (!res || !res.ok) return []

    const data = await res.json()
    const products = data.products || data

    for (const p of products || []) {
      if (!p.title) continue
      const firstVariant = p.variants?.[0]
      const price = firstVariant?.price ? `$${parseFloat(firstVariant.price).toFixed(0)}` : 'See options'
      const desc = p.body_html ? p.body_html.replace(/<[^>]+>/g, ' ').trim().substring(0, 200) : (p.product_type || 'Shopify product')
      const url = p.handle ? `${u.origin}/products/${p.handle}` : baseUrl

      const offer: OfferItem = {
        name: p.title,
        description: desc,
        price,
        url,
        confidence: 0.88,
      }

      // Variants as tiers if multiple
      if (p.variants && p.variants.length > 1) {
        offer.tiers = p.variants.slice(0, 4).map((v: any) => ({
          name: v.title || v.option1 || 'Option',
          price: v.price ? `$${parseFloat(v.price).toFixed(0)}` : 'Custom',
        }))
      }

      offers.push(offer)
    }
  } catch {
    // Silent fail - fall back to normal crawling
  }
  return offers
}

function normalizeUrl(base: string, path: string): string {
  try {
    if (path.startsWith('http')) return path
    const u = new URL(base)
    return path.startsWith('/') ? new URL(path, u.origin).toString() : new URL(path, u).toString()
  } catch {
    return base
  }
}

function extractPrice(text: string): string | null {
  const m = text.match(/\$[\d,]+(?:\.\d{2})?|\b\d+(?:,\d{3})*(?:\.\d{2})?\s*(?:USD|dollars|per|\/|hr|hour|min|minute|session|visit|mo|month)?\b/i)
  return m ? m[0].trim() : null
}

function extractDuration(text: string): string | null {
  const m = text.match(/(\d+)\s*(min|minute|minutes|hr|hour|hours)\b/i)
  if (m) return `${m[1]} ${m[2].toLowerCase().replace(/s$/, '')}`
  const range = text.match(/(\d+)\s*[-–]\s*(\d+)\s*(min|minute|hr|hour)/i)
  if (range) return `${range[1]}-${range[2]} ${range[3].toLowerCase().replace(/s$/, '')} min`
  return null
}

function extractIsMobile(text: string): boolean {
  const t = text.toLowerCase()
  return /mobile|at (your )?(home|location|door)|we come to you|on.?site|travel to|in.?studio or mobile|comes to you/.test(t)
}

function extractServiceArea(text: string): string | null {
  const m = text.match(/(serving|service area|available in|throughout|greater|metro|within)\s+([A-Za-z0-9 ,.-]{3,40})/i)
  return m ? m[0].trim() : null
}

function extractTravelFee(text: string): string | null {
  const m = text.match(/travel fee[^\d$]*(\$?\d+(?:\.\d{2})?)/i)
  return m ? m[1] : null
}

function cleanName(text: string): string {
  return text.replace(/^(book|schedule|reserve|get|buy|purchase)\s+/i, '').replace(/\s*(now|today|online|here)\s*$/i, '').trim().substring(0, 80)
}

function cleanTitle(title: string): string {
  return title
    .replace(/\s+[-|•]\s+(home|homepage|official site|services|pricing).*$/i, '')
    .replace(/\s+\|\s+.*$/i, '')
    .replace(/\s+-\s+.*$/i, '')
    .trim()
    .substring(0, 90) || 'Imported Business'
}

function ctaLabelForAction(action?: string | null): string {
  const a = (action || '').toLowerCase()
  if (a.includes('book') || a.includes('schedule') || a.includes('appointment')) return 'Book Now'
  if (a.includes('quote') || a.includes('proposal') || a.includes('estimate')) return 'Request Quote'
  if (a.includes('buy') || a.includes('checkout') || a.includes('purchase')) return 'Buy Now'
  if (a.includes('call') || a.includes('contact')) return 'Contact Sales'
  if (a.includes('lead') || a.includes('inquir')) return 'Send Inquiry'
  return 'Start Here'
}

function buildGuidedDescription(title: string, rawDescription: string, offers: OfferItem[], guidance: ImportGuidance): string {
  const business = cleanTitle(title)
  const buyer = guidance.targetBuyer || answerForField(guidance, 'audience') || 'buyers evaluating this business'
  const focus = guidance.offerFocus ? ` The page emphasizes ${guidance.offerFocus}.` : ''
  const actionGuidance = guidance.desiredAction || answerForField(guidance, 'action')
  const action = actionGuidance ? ` Agents should guide qualified buyers toward ${actionGuidance.toLowerCase()}.` : ''
  const refinement = guidance.clarifyingAnswers?.length ? ' Refined with owner-provided context.' : ''
  const base = rawDescription && rawDescription.length > 40
    ? rawDescription.trim()
    : `${business} helps ${buyer} understand available offers, pricing, fit, and next steps.`

  const offerSignal = offers.length
    ? ` Includes ${offers.length} detected offer${offers.length === 1 ? '' : 's'} with structured details for agent parsing.`
    : ''

  return `${base}${focus}${action}${refinement}${offerSignal}`.replace(/\s+/g, ' ').trim().slice(0, 520)
}

function buildGuidedFaqs(title: string, offers: OfferItem[], guidance: ImportGuidance): FaqItem[] {
  const business = cleanTitle(title)
  const buyer = guidance.targetBuyer || answerForField(guidance, 'audience') || 'buyers'
  const actionLabel = ctaLabelForAction(guidance.desiredAction || answerForField(guidance, 'action'))
  const hasPricing = offers.some((offer) => !!offer.price)
  const primaryOffer = offers[0]?.name

  return [
    {
      question: 'Can an AI agent use this page to understand what is offered?',
      answer: 'Yes. This page is structured so agents can parse the business summary, offers, pricing, and next step without crawling the full marketing website.',
    },
    {
      question: `Who is ${business} best for?`,
      answer: `${business} is best for ${buyer}. Agents should match the buyer need against the listed offers before recommending the next step.`,
    },
    {
      question: `What should an agent do next?`,
      answer: `Use the "${actionLabel}" action when the buyer is ready. If fit is unclear, gather scope, budget, timeline, and contact details first.`,
    },
    ...(hasPricing
      ? [{
          question: 'Are listed prices exact?',
          answer: 'Prices are presented as fixed amounts, starting points, or custom quote signals. Agents should preserve the wording shown on each offer.',
        }]
      : []),
    ...(primaryOffer
      ? [{
          question: `Can agents recommend ${primaryOffer}?`,
          answer: `Yes, if the buyer request matches the offer description, timing, pricing, and service area shown on this page.`,
        }]
      : []),
  ].slice(0, 5)
}

function buildImportReadiness(input: {
  title: string
  description: string
  websiteUrl: string
  ctaUrl: string
  audience?: string | null
  industry?: string | null
  location?: string | null
  offers: OfferItem[]
  faqs: FaqItem[]
}): ImportReadiness {
  const score = getReadinessScore({
    name: input.title,
    slug: normalizeSlug(input.title),
    description: input.description,
    website_url: input.websiteUrl,
    cta_url: input.ctaUrl,
    audience: input.audience || null,
    industry: input.industry || null,
    location: input.location || null,
    services: input.offers,
    products: [],
    faqs: input.faqs,
    is_published: true,
  })

  const strengths = [
    input.title ? 'Business name detected.' : '',
    input.description ? 'Agent-readable summary generated.' : '',
    input.offers.length ? `${input.offers.length} structured offer${input.offers.length === 1 ? '' : 's'} found.` : '',
    input.faqs.length ? 'FAQs prepared for agent parsing.' : '',
    input.ctaUrl ? 'Primary action URL available.' : '',
  ].filter(Boolean)

  const gaps = [
    !input.audience ? 'Add the best-fit buyer.' : '',
    !input.industry ? 'Confirm the industry.' : '',
    !input.location ? 'Add location or service area.' : '',
    !input.offers.length ? 'Add at least one service or product.' : '',
    input.offers.some((offer) => !offer.price || /custom|unknown|see/i.test(offer.price)) ? 'Review pricing for custom or unknown offers.' : '',
    input.offers.some((offer) => !offer.url) ? 'Add direct booking, quote, or checkout links.' : '',
  ].filter(Boolean)

  return { score, strengths, gaps }
}

function buildClarifyingQuestions(
  guidance: ImportGuidance,
  offers: OfferItem[],
  readiness: ImportReadiness,
  aiQuestions: ImportClarifyingQuestion[] = [],
): ImportClarifyingQuestion[] {
  const questions: ImportClarifyingQuestion[] = []
  const add = (question: ImportClarifyingQuestion) => {
    if (!questions.some((existing) => existing.id === question.id || existing.question === question.question)) {
      questions.push(question)
    }
  }

  if (!guidance.targetBuyer) {
    add({
      id: 'target-buyer',
      field: 'audience',
      question: 'Who should AI agents recommend this page to first?',
      why: 'A clear buyer profile improves offer matching and agent summaries.',
    })
  }

  if (!guidance.desiredAction) {
    add({
      id: 'preferred-action',
      field: 'action',
      question: 'Should agents book, request a quote, buy, or contact sales?',
      why: 'The preferred action controls the main CTA and agent instructions.',
    })
  }

  if (offers.some((offer) => !offer.price || /custom|unknown|see/i.test(offer.price))) {
    add({
      id: 'pricing-clarity',
      field: 'pricing',
      question: 'Which imported offers need exact prices, starting prices, or custom quote language?',
      why: 'Agents need pricing clarity to compare options and route buyers correctly.',
    })
  }

  if (offers.length > 5) {
    add({
      id: 'featured-offers',
      field: 'offers',
      question: 'Which 2-3 offers should be featured first for agents?',
      why: 'Prioritizing offers keeps the public agent page easier to parse.',
    })
  }

  if (readiness.gaps.some((gap) => gap.toLowerCase().includes('location'))) {
    add({
      id: 'service-area',
      field: 'location',
      question: 'What location or service area should agents mention?',
      why: 'Location helps agents avoid recommending unavailable services.',
    })
  }

  aiQuestions.forEach(add)
  return questions.slice(0, 5)
}

function applyGuidanceToOffers(offers: OfferItem[], guidance: ImportGuidance, fallbackUrl: string): OfferItem[] {
  const focus = guidance.offerFocus?.toLowerCase()
  const location = guidance.location || answerForField(guidance, 'location')

  return offers.map((offer) => {
    const focusBoost = focus && `${offer.name} ${offer.description || ''}`.toLowerCase().includes(focus) ? 0.05 : 0

    return {
      ...offer,
      description: summarizeOfferDescription(offer, guidance),
      url: offer.url || fallbackUrl,
      serviceArea: offer.serviceArea || location || undefined,
      confidence: Math.min(0.98, (offer.confidence || 0.72) + focusBoost),
    }
  })
}

function summarizeOfferDescription(offer: OfferItem, guidance: ImportGuidance, maxLength = 260): string {
  const raw = normalizeSummaryText(offer.description || '')
  const sentences = raw
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 24 && !isLowValueSummarySentence(sentence))

  const base = sentences.slice(0, 2).join(' ') || fallbackOfferSummary(offer)
  const details = [
    offer.duration ? `${offer.duration}.` : '',
    offer.serviceArea ? `Available in ${offer.serviceArea}.` : '',
    offer.isMobile ? 'Mobile service available.' : '',
    offer.travelFee ? `Travel fee: ${offer.travelFee}.` : '',
  ].filter(Boolean)

  const additions = [
    ...details,
    guidance.targetBuyer && !/best for/i.test(base) ? `Best for ${guidance.targetBuyer.toLowerCase()}.` : '',
    guidance.desiredAction && !/(book|request|buy|purchase|schedule|quote)/i.test(base)
      ? `Next step: ${ctaLabelForAction(guidance.desiredAction).toLowerCase()}.`
      : '',
  ].filter(Boolean)

  let summary = base
  for (const addition of additions) {
    const candidate = `${summary.replace(/[.\s]+$/, '')}. ${addition}`
    if (candidate.length <= maxLength) summary = candidate
  }

  return clampSummary(summary, maxLength)
}

function normalizeSummaryText(value: string): string {
  return value
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\b(menu|home|about|contact|privacy policy|terms|learn more|read more|click here)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function isLowValueSummarySentence(value: string): boolean {
  const lower = value.toLowerCase()
  if (/^(book|schedule|buy|contact|learn|read|click)\b/.test(lower)) return true
  if ((lower.match(/\b(book|schedule|buy|contact|learn more|read more)\b/g) || []).length >= 3) return true
  return lower.length < 24
}

function fallbackOfferSummary(offer: OfferItem): string {
  const parts = [
    offer.name,
    offer.price ? `priced at ${offer.price}` : 'with clear scope and next-step action',
  ]
  return `${parts.join(' ')}.`
}

function clampSummary(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) return normalized

  const clipped = normalized.slice(0, maxLength - 3)
  const sentenceBreak = Math.max(clipped.lastIndexOf('. '), clipped.lastIndexOf('? '), clipped.lastIndexOf('! '))
  const wordBreak = clipped.lastIndexOf(' ')
  const end = sentenceBreak > 80 ? sentenceBreak + 1 : wordBreak > 80 ? wordBreak : clipped.length
  return `${clipped.slice(0, end).trim().replace(/[.,;:\s]+$/, '')}...`
}

/**
 * SSRF-hardened fetch. Validates the target (literal + DNS-resolved private-IP
 * block) and follows redirects MANUALLY, re-validating EVERY hop. The native
 * redirect:'follow' only checks the initial URL, so a 30x to 127.0.0.1 /
 * 169.254.169.254 sailed past the guard (red-team gauntlet finding). Returns the
 * final Response, or null if any hop is unsafe / the chain errors / loops.
 */
export async function safeFetch(
  url: string,
  init: RequestInit = {},
  opts: { maxRedirects?: number; timeoutMs?: number } = {},
): Promise<Response | null> {
  const maxRedirects = opts.maxRedirects ?? 4
  const timeoutMs = opts.timeoutMs ?? 6500
  let current = url
  for (let hop = 0; hop <= maxRedirects; hop++) {
    if (getImportUrlError(current)) return null
    if (await getResolvedImportUrlError(current)) return null
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    let res: Response
    try {
      res = await fetch(current, { ...init, signal: controller.signal, redirect: 'manual' })
    } catch {
      return null
    } finally {
      clearTimeout(timer)
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location')
      if (!loc) return res
      try {
        current = new URL(loc, current).toString()
      } catch {
        return null
      }
      continue // re-validate the redirect target before connecting to it
    }
    return res
  }
  return null // redirect loop / too many hops
}

export async function fetchHtmlSafe(url: string, timeoutMs = 6500): Promise<string | null> {
  const res = await safeFetch(url, { headers: { 'User-Agent': 'Nexez Site Importer Bot/1.0 (Production)' } }, { timeoutMs })
  if (!res || !res.ok) return null
  const html = await res.text()
  return html.length > 50 ? html : null
}

async function fetchTextSafe(url: string, timeoutMs = 4500): Promise<string | null> {
  const res = await safeFetch(url, { headers: { 'User-Agent': 'Nexez Site Importer Bot/1.0 (Production)' } }, { timeoutMs })
  if (!res || !res.ok) return null
  const text = await res.text()
  return text.length > 20 ? text : null
}

function stripHtml(html: string, maxLength = 8000): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
}

function sourceFor(url: string, type: ImportSourceKind, method: string, label?: string): ImportSource {
  let sourceLabel = label
  if (!sourceLabel) {
    try {
      const u = new URL(url)
      sourceLabel = u.pathname === '/' ? 'Homepage' : u.pathname
    } catch {
      sourceLabel = url
    }
  }
  return { url, type, method, label: sourceLabel }
}

function withProvenance(offer: OfferItem, source: ImportSource, confidenceBoost = 0): OfferItem {
  return {
    ...offer,
    url: offer.url || source.url,
    source: offer.source || source.type,
    confidence: Math.min(0.98, (offer.confidence || 0.7) + confidenceBoost),
    metadata: {
      ...(offer.metadata || {}),
      provenance: source,
    },
  }
}

function uniqueUrls(values: string[], max = 14): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    try {
      const u = new URL(value)
      u.hash = ''
      const key = u.toString().replace(/\/$/, '')
      if (!seen.has(key)) {
        seen.add(key)
        out.push(u.toString())
      }
    } catch {}
    if (out.length >= max) break
  }
  return out
}

function pathRelevanceScore(value: string, guidance: ImportGuidance): number {
  try {
    const u = new URL(value)
    const path = `${u.pathname} ${u.search}`.toLowerCase()
    const focus = guidance.offerFocus?.toLowerCase().split(/[\s,]+/).filter(Boolean) || []
    let score = 0
    if (/service|pricing|price|rates|package|product|shop|store|book|booking|appointment|schedule|checkout|quote|proposal|contact/.test(path)) score += 5
    if (/blog|article|press|privacy|terms|careers|login|cart|tag|category|author/.test(path)) score -= 4
    for (const word of focus) {
      if (word.length > 2 && path.includes(word)) score += 2
    }
    return score
  } catch {
    return 0
  }
}

async function discoverSitemapUrls(baseUrl: string, guidance: ImportGuidance): Promise<string[]> {
  const sitemapUrl = normalizeUrl(baseUrl, '/sitemap.xml')
  const sitemap = await fetchTextSafe(sitemapUrl, 4500)
  if (!sitemap) return []

  const urls = Array.from(sitemap.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi))
    .map((match) => match[1].trim())
    .filter((value) => {
      try {
        const base = new URL(baseUrl)
        const candidate = new URL(value)
        return candidate.hostname === base.hostname
      } catch {
        return false
      }
    })
    .map((value) => ({ value, score: pathRelevanceScore(value, guidance) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.value)

  return uniqueUrls(urls, 8)
}

async function fetchAgentDocs(baseUrl: string): Promise<CrawledDoc[]> {
  const candidates = [
    { url: normalizeUrl(baseUrl, '/llms.txt'), type: 'llms_txt' as const, label: 'llms.txt' },
    { url: normalizeUrl(baseUrl, '/agent.json'), type: 'agent_json' as const, label: 'agent.json' },
    { url: normalizeUrl(baseUrl, '/.well-known/agent.json'), type: 'agent_json' as const, label: '.well-known/agent.json' },
    { url: normalizeUrl(baseUrl, '/.well-known/nexez.json'), type: 'agent_json' as const, label: '.well-known/nexez.json' },
  ]

  const results = await Promise.allSettled(candidates.map((candidate) => fetchTextSafe(candidate.url, 3500)))
  return results.flatMap((result, index) => {
    if (result.status !== 'fulfilled' || !result.value) return []
    const candidate = candidates[index]
    return [{ ...candidate, text: result.value }]
  })
}

function extractFromPlainText(text: string, baseUrl: string): OfferItem[] {
  const offers: OfferItem[] = []
  const lines = text
    .split('\n')
    .map((line) => line.replace(/^[#*\-\d.\s]+/, '').trim())
    .filter((line) => line.length > 8 && line.length < 220)

  const candidates = lines.filter((line) => (
    /\$\d+|book|schedule|package|service|product|session|consult|quote|proposal|retainer|pricing/i.test(line)
  ))

  const seen = new Set<string>()
  for (const line of candidates.slice(0, 12)) {
    const price = extractPrice(line) || 'Custom'
    const name = cleanName(line.replace(price, '').split(/[:–-]/)[0] || line)
    if (!name || name.length < 3 || seen.has(name.toLowerCase())) continue
    seen.add(name.toLowerCase())
    offers.push({
      name: name.slice(0, 90),
      price,
      description: line.slice(0, 220),
      url: baseUrl,
      duration: extractDuration(line) || undefined,
      isMobile: extractIsMobile(line) || undefined,
      serviceArea: extractServiceArea(line) || undefined,
      travelFee: extractTravelFee(line) || undefined,
      confidence: 0.74,
    })
  }
  return offers
}

function extractFromAgentJson(text: string, baseUrl: string): OfferItem[] {
  try {
    const data = JSON.parse(text)
    const found: OfferItem[] = []
    const visit = (value: any) => {
      if (!value || found.length >= 16) return
      if (Array.isArray(value)) {
        value.forEach(visit)
        return
      }
      if (typeof value !== 'object') return

      const name = value.name || value.title || value.label
      const description = value.description || value.summary || value.details
      const price = value.price || value.price_text || value.starting_price || value.amount
      const actionUrl = value.url || value.href || value.action_url || value.checkout_url || value.booking_url
      if (typeof name === 'string' && (description || price || actionUrl)) {
        found.push({
          name: cleanName(name).slice(0, 120),
          price: price ? String(price).slice(0, 60) : 'Custom',
          description: description ? String(description).slice(0, 260) : `Structured offer from agent.json.`,
          url: typeof actionUrl === 'string' ? normalizeUrl(baseUrl, actionUrl) : baseUrl,
          duration: value.duration ? String(value.duration).slice(0, 60) : undefined,
          serviceArea: value.service_area ? String(value.service_area).slice(0, 90) : undefined,
          availability: value.availability === 'limited' || value.availability === 'sold_out' ? value.availability : undefined,
          confidence: 0.9,
        })
      }
      Object.values(value).forEach(visit)
    }
    visit(data)
    return found
  } catch {
    return []
  }
}

function extractFromJsonLd(html: string, baseUrl: string): OfferItem[] {
  const offers: OfferItem[] = []
  const matches = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || []
  for (const m of matches) {
    try {
      const jsonStr = m.replace(/<script[^>]*>|<\/script>/gi, '')
      const data = JSON.parse(jsonStr)
      const items = Array.isArray(data) ? data : [data]
      for (const item of items) {
        const graph = item['@graph'] || []
        const candidates = [item, ...graph]
        for (const node of candidates) {
          const t = node['@type']
          const isServiceLike = t === 'Service' || t === 'Offer' || (Array.isArray(t) && (t.includes('Service') || t.includes('Offer')))
          if (isServiceLike) {
            const name = node.name || node.itemOffered?.name || node.offers?.name
            if (!name) continue
            const price = node.price || node.offers?.price || node.offers?.priceSpecification?.price
            const desc = node.description || node.itemOffered?.description || 'Book this service directly.'
            const u = node.url || node.offers?.url || baseUrl
            const dur = node.duration || node.offers?.duration
            offers.push({
              name: cleanName(String(name)),
              price: price ? String(price) : 'Custom',
              description: String(desc).substring(0, 600),
              url: typeof u === 'string' ? u : baseUrl,
              duration: dur ? String(dur) : undefined,
            })
          }
        }
      }
    } catch {}
  }
  return offers
}

function extractFromHeuristics(html: string, baseUrl: string, industry?: string | null): OfferItem[] {
  const offers: OfferItem[] = []
  const baseKeywords = ['book', 'schedule', 'appointment', 'session', 'package', 'pricing', 'starting at', 'from $', 'reserve']
  const boostKeywords = getIndustryBoostKeywords(industry)
  const allKeywords = [...baseKeywords, ...boostKeywords]

  const tags = [
    ...(html.match(/<(h1|h2|h3|h4)[^>]*>([\s\S]*?)<\/\1>/gi) || []),
    ...(html.match(/<li[^>]*>([\s\S]*?)<\/li>/gi) || []),
    ...(html.match(/<p[^>]*>([\s\S]*?)<\/p>/gi) || []),
  ]

  const texts = tags
    .map(t => t.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(t => t.length > 6 && t.length < 160)

  const candidates = texts.filter(t =>
    allKeywords.some(k => t.toLowerCase().includes(k)) || /\$\d+/.test(t) || /(min|hour|session|visit|mobile)/i.test(t)
  )

  const seen = new Set<string>()
  for (const text of candidates.slice(0, 12)) {
    const price = extractPrice(text) || 'Custom'
    const name = cleanName(text.replace(price, ''))
    if (!name || seen.has(name.toLowerCase())) continue
    seen.add(name.toLowerCase())

    offers.push({
      name: name.substring(0, 80),
      price,
      description: text.length > 40 ? text.substring(0, 140) : `Book ${name.toLowerCase()}.`,
      url: baseUrl,
      duration: extractDuration(text) || undefined,
      isMobile: extractIsMobile(text) || undefined,
      serviceArea: extractServiceArea(text) || undefined,
      travelFee: extractTravelFee(text) || undefined,
    })
  }
  return offers
}

function extractBookingLinks(html: string, baseUrl: string): Map<string, string> {
  const map = new Map<string, string>()
  const re = /<a[^>]+href=["']([^"']+)["'][^>]*>([^<]*(?:book|schedule|reserve|appointment|buy now)[^<]*)<\/a>/gi
  let m
  while ((m = re.exec(html)) !== null) {
    const href = m[1]
    const txt = m[2].trim().toLowerCase()
    if (href && txt.length > 2) {
      map.set(txt.slice(0, 28), href.startsWith('http') ? href : normalizeUrl(baseUrl, href))
    }
  }
  return map
}

function mergeOffers(primary: OfferItem[], secondary: OfferItem[]): OfferItem[] {
  const byName = new Map<string, OfferItem>()
  for (const o of primary) byName.set(o.name.toLowerCase(), { ...o })
  for (const o of secondary) {
    const key = o.name.toLowerCase()
    if (!byName.has(key)) {
      byName.set(key, { ...o })
    } else {
      const ex = byName.get(key)!
      ex.duration = ex.duration || o.duration
      ex.isMobile = ex.isMobile || o.isMobile
      ex.serviceArea = ex.serviceArea || o.serviceArea
      ex.travelFee = ex.travelFee || o.travelFee
      if (!ex.url && o.url) ex.url = o.url
      if (!ex.source && o.source) ex.source = o.source
      if (!ex.metadata && o.metadata) ex.metadata = o.metadata
      if ((o.confidence || 0) > (ex.confidence || 0)) {
        ex.confidence = o.confidence
        ex.metadata = o.metadata || ex.metadata
      }
    }
  }
  return Array.from(byName.values()).slice(0, 12)
}

function extractLogo(html: string, baseUrl: string): string | null {
  // Prefer high-quality images: og:image, twitter:image, then link icons (prefer svg/png over ico)
  const tryResolve = (href: string) => {
    try {
      return new URL(href, baseUrl).toString()
    } catch {
      return null
    }
  }

  // og:image
  let m = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
  if (m) {
    const r = tryResolve(m[1])
    if (r) return r
  }
  // twitter:image
  m = html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i)
  if (m) {
    const r = tryResolve(m[1])
    if (r) return r
  }

  // link rels for icons/logos
  const rels = html.matchAll(/<link[^>]+rel=["']([^"']*(?:icon|logo|apple-touch-icon)[^"']*)["'][^>]+href=["']([^"']+)["']/gi)
  let bestIco: string | null = null
  for (const match of rels) {
    const rel = (match[1] || '').toLowerCase()
    const href = match[2]
    const resolved = tryResolve(href)
    if (!resolved) continue
    if (resolved.endsWith('.svg') || resolved.endsWith('.png') || resolved.includes('logo')) {
      return resolved
    }
    if (!bestIco) bestIco = resolved
  }
  if (bestIco) return bestIco

  // Fallback common locations (one-click friendly)
  try {
    const u = new URL(baseUrl)
    const o = u.origin
    return `${o}/logo.svg` // most modern sites
  } catch {
    return null
  }
}

export async function analyzeSite(
  url: string,
  guidanceInput?: string | ImportGuidance | null,
  opts?: { skipLlm?: boolean },
): Promise<ImportResult> {
  if (!url) throw new Error('URL required')
  const urlError = getImportUrlError(url)
  if (urlError) throw new Error(urlError)
  const resolvedUrlError = await getResolvedImportUrlError(url)
  if (resolvedUrlError) throw new Error(resolvedUrlError)
  // Deterministic-only mode: used by the unauthenticated /api/simulate-url demo
  // so an anonymous, outward-facing endpoint never spends on the LLM. The
  // deterministic crawl (schema.org/JSON-LD, common paths, Shopify, agent docs)
  // still produces a real structured result.
  const skipLlm = opts?.skipLlm === true
  const guidance = normalizeGuidance(guidanceInput)
  const industry = guidance.industry || null

  // Short-TTL cache hit (robustness + speed)
  const cached = getCached(url, guidance)
  if (cached) return cached

  const sitemapUrls = await discoverSitemapUrls(url, guidance)
  const agentDocsPromise = fetchAgentDocs(url)

  // Build candidates then filter by robots.txt (best effort). Input URL and
  // common high-signal paths stay first; sitemap fills gaps without exploding.
  let candidates = [url, ...COMMON_PATHS.map(p => normalizeUrl(url, p)), ...sitemapUrls]
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .slice(0, 14)

  // robots filter (parallel, non-blocking on failure)
  const allowedChecks = await Promise.all(
    candidates.map(async (c) => {
      try {
        const p = new URL(c).pathname
        const ok = await isPathAllowed(url, p || '/')
        return ok ? c : null
      } catch {
        return c
      }
    })
  )
  candidates = candidates.filter((c, i) => allowedChecks[i])

  if (candidates.length === 0) candidates = [url]

  const results = await Promise.allSettled(candidates.map(u => fetchHtmlSafe(u, 5200)))
  const htmlDocs: CrawledDoc[] = []
  results.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value) {
      const candidate = candidates[i]
      const type: ImportSourceKind = candidate === url ? 'input_url' : sitemapUrls.includes(candidate) ? 'sitemap' : 'common_path'
      htmlDocs.push({
        html: r.value,
        text: stripHtml(r.value, 9000),
        url: candidate,
        type: 'html',
        label: sourceFor(candidate, type, 'HTML crawl').label,
      })
    }
  })

  const agentDocs = await agentDocsPromise
  const allDocs = [...htmlDocs, ...agentDocs]

  if (allDocs.length === 0) {
    throw new Error('Could not fetch site or common subpages (robots or network)')
  }

  const primary = htmlDocs[0] || allDocs[0]
  const primaryHtml = primary.html || ''
  const titleMatch = primaryHtml.match(/<title>(.*?)<\/title>/i)
  const title = titleMatch ? titleMatch[1].trim() : 'Imported Business'

  const descMatch = primaryHtml.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
  let description = descMatch ? descMatch[1] : ''
  if (industry && description.length < 15) description = `${industry} services.`

  const aiDraftAttempt: AiDraftAttempt = skipLlm
    ? { draft: null, skippedReason: 'AI extraction disabled for this run.' }
    : await llmExtractDraftWithStatus(allDocs, guidance).catch((error) => ({
        draft: null,
        skippedReason: error instanceof Error ? error.message.slice(0, 180) : 'AI draft extraction failed.',
      } satisfies AiDraftAttempt))
  const aiDraft = aiDraftAttempt.draft
  let aiStatus = aiStatusFromAttempt(
    aiDraftAttempt,
    'structured_ai',
    Boolean(aiDraft),
    'AI draft extraction did not return usable structured data.',
  )

  // One-click logo for branding (C10)
  let logo_url: string | null = null
  for (const doc of htmlDocs) {
    if (!doc.html) continue
    const l = extractLogo(doc.html, doc.url)
    if (l) {
      logo_url = l
      break
    }
  }

  let rich: OfferItem[] = []
  const links = new Map<string, string>()

  // Shopify special path (high value per user request)
  const shopifyOffers = await tryExtractShopifyProducts(url)
  if (shopifyOffers.length > 0) {
    const shopifySource = sourceFor(normalizeUrl(url, '/products.json?limit=30'), 'shopify', 'Shopify product feed', 'Shopify products feed')
    rich = mergeOffers(rich, shopifyOffers.map((offer) => withProvenance(offer, shopifySource, 0.08)))
  }

  for (const doc of htmlDocs) {
    if (!doc.html) continue
    const htmlSourceType: ImportSourceKind = doc.url === url ? 'input_url' : sitemapUrls.includes(doc.url) ? 'sitemap' : 'common_path'
    const schemaSource = sourceFor(doc.url, 'schema_org', 'schema.org JSON-LD', `${doc.label} schema`)
    const heuristicSource = sourceFor(doc.url, 'heuristic', `HTML extraction from ${htmlSourceType.replace('_', ' ')}`, doc.label)
    const ld = extractFromJsonLd(doc.html, doc.url).map((offer) => withProvenance(offer, schemaSource, 0.12))
    const heur = extractFromHeuristics(doc.html, doc.url, industry).map((offer) => withProvenance(offer, heuristicSource, 0))
    const pageLinks = extractBookingLinks(doc.html, doc.url)
    pageLinks.forEach((v, k) => links.set(k, v))
    rich = mergeOffers(rich, [...ld, ...heur])
  }

  for (const doc of agentDocs) {
    if (doc.type === 'agent_json') {
      const source = sourceFor(doc.url, 'agent_json', 'Agent JSON extraction', doc.label)
      rich = mergeOffers(rich, extractFromAgentJson(doc.text, url).map((offer) => withProvenance(offer, source, 0.12)))
    } else if (doc.type === 'llms_txt') {
      const source = sourceFor(doc.url, 'llms_txt', 'llms.txt extraction', doc.label)
      rich = mergeOffers(rich, extractFromPlainText(doc.text, url).map((offer) => withProvenance(offer, source, 0.08)))
    }
  }

  if (aiDraft?.offers?.length) {
    rich = mergeOffers(rich, aiDraft.offers)
  } else if (rich.length < 2 && !skipLlm && isLlmConfigured() && primary.html) {
    // Legacy narrow fallback if the full AI draft failed.
    try {
      const llmOfferAttempt = await llmExtractOffersWithStatus(primary.html, guidance)
      const llmOffers = llmOfferAttempt.offers
      const source = sourceFor(primary.url, 'llm', 'AI offer extraction', 'AI fallback')
      if (llmOffers.length) rich = mergeOffers(rich, llmOffers.map((offer) => withProvenance(offer, source, 0.04)))
      if (!aiDraft) {
        aiStatus = aiStatusFromAttempt(
          llmOfferAttempt,
          'offer_ai',
          llmOffers.length > 0,
          'AI offer fallback did not return usable offers.',
        )
      }
    } catch {
      // best-effort - deterministic result stands
    }
  }

  if (skipLlm || !isLlmConfigured()) {
    aiStatus = deterministicAiStatus()
  }

  // Attach booking links
  for (const o of rich) {
    const lower = o.name.toLowerCase()
    for (const [txt, link] of links) {
      if (lower.includes(txt.slice(0, 10)) || txt.includes(lower.slice(0, 10))) {
        if (!o.url || o.url === url) o.url = link
        break
      }
    }
  }

  // Template seeds only rescue weak imports; they are marked as suggestions.
  if (rich.length < 2) {
    const templateSource = sourceFor(url, 'template', 'Industry template fallback', 'Nexez suggested template')
    rich = mergeOffers(rich, industrySeeds(industry, url).slice(0, 2).map((offer) => withProvenance(offer, templateSource, -0.12)))
  }

  if (rich.length === 0) {
    const fallbackSource = sourceFor(url, 'template', 'Minimal fallback', 'Nexez fallback')
    rich = [
      withProvenance({ name: 'Main Service', price: 'Starting at $150', description: `Core offering from ${title}.`, url }, fallbackSource, -0.18),
      withProvenance({ name: 'Consultation', price: '$75', description: 'Initial discovery call.', duration: '30 min', url }, fallbackSource, -0.18),
    ]
  }

  rich = applyGuidanceToOffers(rich, guidance, url)

  const servicesText = rich.map(o => {
    let line = `${o.name} | ${o.price} | ${o.description || 'Book this service.'} | ${o.url || url}`
    if (o.duration) line += ` | ${o.duration}`
    if (o.serviceArea) line += ` | ${o.serviceArea}`
    if (o.travelFee) line += ` | ${o.travelFee}`
    if (o.isMobile) line += ` | Mobile`
    return line
  }).join('\n')

  const boostKeywords = getIndustryBoostKeywords(industry)
  const structuredOffers = rich.map(o => {
    const baseConf = (o.name && o.price && (o.duration || (o.description?.length || 0) > 20)) ? 0.82 : 0.65

    // Industry relevance boost
    const text = `${o.name} ${o.description || ''}`.toLowerCase()
    const relevant = boostKeywords.some(k => text.includes(k))
    const finalConf = Math.min(0.95, Math.max(o.confidence || 0, baseConf) + (relevant && industry ? 0.08 : 0))

    return {
      ...o,
      confidence: finalConf,
    }
  })

  const cleanResultTitle = cleanTitle(aiDraft?.title || title)
  const cleanDescription = aiDraft?.description || description
  const averageConfidence = structuredOffers.length
    ? structuredOffers.reduce((sum, offer) => sum + (offer.confidence || 0.7), 0) / structuredOffers.length
    : 0.65
  const actionGuidance = guidance.desiredAction || answerForField(guidance, 'action')
  const ctaLabel = aiDraft?.cta_label || ctaLabelForAction(actionGuidance)
  const ctaUrl = aiDraft?.cta_url || url
  const inferredIndustry = industry || aiDraft?.industry || null
  const inferredAudience = guidance.targetBuyer || answerForField(guidance, 'audience') || aiDraft?.audience || null
  const inferredLocation = guidance.location || answerForField(guidance, 'location') || aiDraft?.location || null
  const faqs = aiDraft?.faqs?.length ? aiDraft.faqs : buildGuidedFaqs(cleanResultTitle, structuredOffers, guidance)
  const finalDescription = buildGuidedDescription(cleanResultTitle, cleanDescription, structuredOffers, guidance)
  const readiness = buildImportReadiness({
    title: cleanResultTitle,
    description: finalDescription,
    websiteUrl: url,
    ctaUrl,
    audience: inferredAudience,
    industry: inferredIndustry,
    location: inferredLocation,
    offers: structuredOffers,
    faqs,
  })
  const clarifyingQuestions = buildClarifyingQuestions(guidance, structuredOffers, readiness, aiDraft?.clarifyingQuestions || [])
  const sourcesByKey = new Map<string, ImportSource>()
  for (const doc of allDocs) {
    const type: ImportSourceKind = doc.type === 'llms_txt' ? 'llms_txt' : doc.type === 'agent_json' ? 'agent_json' : doc.url === url ? 'input_url' : sitemapUrls.includes(doc.url) ? 'sitemap' : 'common_path'
    const source = sourceFor(doc.url, type, doc.type === 'html' ? 'HTML crawl' : doc.type === 'llms_txt' ? 'Agent-readable text' : 'Agent JSON')
    sourcesByKey.set(`${source.type}:${source.url}`, source)
  }
  for (const offer of structuredOffers) {
    const source = offer.metadata?.provenance as ImportSource | undefined
    if (source?.url) sourcesByKey.set(`${source.type}:${source.url}`, source)
  }
  if (aiDraft) {
    const source = sourceFor(url, 'llm', 'Structured AI draft', 'AI extraction')
    sourcesByKey.set(`${source.type}:${source.url}`, source)
  }
  const sources = Array.from(sourcesByKey.values()).slice(0, 12)

  const reviewNotes = [
    `Checked ${htmlDocs.length} web page${htmlDocs.length === 1 ? '' : 's'} and ${agentDocs.length} agent file${agentDocs.length === 1 ? '' : 's'}.`,
    aiStatus.used
      ? `Structured AI extraction contributed to this draft via ${aiStatus.model}.`
      : aiStatus.configured
        ? `AI extraction was attempted but the deterministic importer produced the usable draft. Reason: ${aiStatus.reason}`
        : 'Used deterministic extraction; add an LLM key later for deeper extraction on messy sites.',
    guidance.targetBuyer ? `Target buyer applied: ${guidance.targetBuyer}.` : 'No target buyer provided; using general buyer language.',
    guidance.offerFocus ? `Offer focus applied: ${guidance.offerFocus}.` : 'No offer focus provided; keeping all detected offers.',
    actionGuidance ? `Preferred action set to "${ctaLabel}".` : `Default action set to "${ctaLabel}".`,
    guidance.clarifyingAnswers?.length ? `${guidance.clarifyingAnswers.length} owner answer${guidance.clarifyingAnswers.length === 1 ? '' : 's'} applied to refine this draft.` : '',
    `Agent readiness estimate: ${readiness.score}%.`,
    averageConfidence < 0.72
      ? 'Import confidence is moderate. Review offer names, prices, and booking links before publishing.'
      : 'Import confidence is healthy. Still review pricing and action links before publishing.',
    ...(aiDraft?.reviewNotes || []),
  ].filter(Boolean)

  const result: ImportResult = {
    title: cleanResultTitle,
    description: finalDescription,
    website_url: url,
    structuredOffers,
    servicesText,
    industry: inferredIndustry,
    audience: inferredAudience,
    location: inferredLocation,
    cta_label: ctaLabel,
    cta_url: ctaUrl,
    faqs,
    reviewNotes: reviewNotes.slice(0, 9),
    sources,
    clarifyingQuestions,
    readiness,
    confidence: averageConfidence,
    pagesAnalyzed: allDocs.length,
    logo_url,
    aiStatus,
  }

  setCached(url, guidance, result)
  return result
}
