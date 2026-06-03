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

import type { OfferItem } from './agent-page'
import { isLlmConfigured, llmComplete } from './llm'

/**
 * Phase 6: optional LLM fallback for ambiguous pages. Strips the page to text
 * and asks the model to extract offers as JSON. Dormant unless LLM_API_KEY is
 * set; always best-effort (returns [] on any failure).
 */
export async function llmExtractOffers(html: string, industry?: string | null): Promise<OfferItem[]> {
  if (!isLlmConfigured()) return []
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 6000)
  if (text.length < 80) return []

  const out = await llmComplete(
    `Extract the products or services this business offers from the page text below. Return ONLY a JSON array of objects with keys: name, price (string, "" if unknown), description (one sentence). Max 8 items. Do not invent offerings.\n\nPage text:\n${text}`,
    { system: 'You extract structured offer data from web pages for AI agents. Output strictly valid JSON, nothing else.', maxTokens: 700, temperature: 0.2 },
  )
  if (!out) return []
  try {
    const json = out.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
    const parsed = JSON.parse(json)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((o) => o && typeof o.name === 'string' && o.name.trim())
      .slice(0, 8)
      .map((o) => ({
        name: String(o.name).trim().slice(0, 120),
        price: typeof o.price === 'string' ? o.price.slice(0, 40) : '',
        description: typeof o.description === 'string' ? o.description.slice(0, 300) : '',
        url: '',
        source: 'llm',
        confidence: 0.7,
      }))
  } catch {
    return []
  }
}

export type ImportResult = {
  title: string
  description: string
  website_url: string
  structuredOffers: (OfferItem & { confidence?: number })[]
  servicesText: string // legacy pipe format for compat during transition
  industry?: string | null
  pagesAnalyzed: number
}

const COMMON_PATHS = ['/services', '/pricing', '/book', '/appointments', '/rates', '/packages', '/contact', '/']
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

// Simple in-memory short-TTL cache (Phase 5 robustness). Avoids hammering the same site repeatedly.
const IMPORT_CACHE = new Map<string, { ts: number; result: ImportResult }>()
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

function getCached(url: string): ImportResult | null {
  const key = normalizeUrl(url, '/')
  const hit = IMPORT_CACHE.get(key)
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.result
  return null
}
function setCached(url: string, result: ImportResult) {
  const key = normalizeUrl(url, '/')
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

// Basic robots.txt respect (Phase 5). We only check Disallow for our paths.
// We never crawl aggressively; this is a best-effort filter.
export async function isPathAllowed(base: string, path: string): Promise<boolean> {
  try {
    const robotsUrl = normalizeUrl(base, '/robots.txt')
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), 4000)
    const res = await fetch(robotsUrl, {
      headers: { 'User-Agent': 'Nexez Site Importer Bot/1.0' },
      signal: controller.signal,
    })
    clearTimeout(t)
    if (!res.ok) return true // no robots or unreadable → allow (we're polite anyway)
    const txt = await res.text()
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
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5000)
    const res = await fetch(shopifyUrl, {
      headers: { 'User-Agent': 'Nexez Site Importer Bot/1.0 (Shopify)' },
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (!res.ok) return []

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
    // Silent fail — fall back to normal crawling
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

export async function fetchHtmlSafe(url: string, timeoutMs = 6500): Promise<string | null> {
  if (getImportUrlError(url)) return null

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Nexez Site Importer Bot/1.0 (Production)' },
      signal: controller.signal,
      redirect: 'follow',
    })
    if (!res.ok) return null
    const html = await res.text()
    return html.length > 50 ? html : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
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
              description: String(desc).substring(0, 200),
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
    let name = cleanName(text.replace(price, ''))
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
      if (!ex.url || ex.url === ex.url) ex.url = o.url || ex.url
    }
  }
  return Array.from(byName.values()).slice(0, 12)
}

function industrySeeds(industry: string | null | undefined, baseUrl: string): OfferItem[] {
  const ind = (industry || '').toLowerCase()
  if (ind.includes('plumb') || ind.includes('home') || ind.includes('clean') || ind.includes('electrical')) {
    return [
      { name: 'Standard Service Call', price: 'From $129', description: 'Diagnosis + minor repair. Includes basic parts.', duration: '60 min', isMobile: true, serviceArea: 'Local metro area', url: baseUrl },
      { name: 'Deep Clean or Maintenance', price: '$189', description: 'Full top-to-bottom or preventive service.', duration: '2-3 hours', isMobile: true, url: baseUrl },
    ]
  }
  if (ind.includes('massage') || ind.includes('wellness') || ind.includes('fitness') || ind.includes('yoga')) {
    return [
      { name: '60-Minute Deep Tissue', price: '$110', description: 'Therapeutic session with hot stones and oils.', duration: '60 min', isMobile: true, travelFee: '$25', url: baseUrl },
    ]
  }
  if (ind.includes('groom') || ind.includes('pet')) {
    return [{ name: 'Full Grooming Package', price: '$85', description: 'Bath, haircut, nails, ears. Mobile service.', duration: '90-120 min', isMobile: true, serviceArea: 'Local', url: baseUrl }]
  }
  if (ind.includes('detailing') || ind.includes('auto') || ind.includes('car')) {
    return [{ name: 'Mobile Car Detailing', price: 'From $149', description: 'Interior + exterior hand wash and detail.', duration: '2-3 hours', isMobile: true, url: baseUrl }]
  }
  // Professional default
  return [
    { name: 'Discovery / Strategy Session', price: '$150', description: '60-minute focused call with clear deliverables and next steps.', duration: '60 min', url: baseUrl },
    { name: 'Core Engagement', price: 'From $1,800', description: 'Full delivery with priority support and reviews.', url: baseUrl },
  ]
}

function getIndustryBoostKeywords(industry?: string | null): string[] {
  const ind = (industry || '').toLowerCase()
  if (ind.includes('plumb') || ind.includes('home') || ind.includes('electrical') || ind.includes('clean')) {
    return ['plumb', 'pipe', 'drain', 'leak', 'toilet', 'faucet', 'clean', 'house', 'home', 'maintenance', 'repair', 'service call']
  }
  if (ind.includes('massage') || ind.includes('wellness') || ind.includes('fitness') || ind.includes('yoga')) {
    return ['massage', 'therapy', 'wellness', 'fitness', 'yoga', 'deep tissue', 'session', 'treatment']
  }
  if (ind.includes('groom') || ind.includes('pet')) {
    return ['groom', 'pet', 'dog', 'cat', 'bath', 'nail', 'fur']
  }
  if (ind.includes('detailing') || ind.includes('auto') || ind.includes('car')) {
    return ['detail', 'car', 'auto', 'vehicle', 'interior', 'exterior', 'wash']
  }
  // Professional services
  return ['session', 'consult', 'strategy', 'coaching', 'engagement', 'discovery', 'retainer']
}

export async function analyzeSite(url: string, industry?: string | null): Promise<ImportResult> {
  if (!url) throw new Error('URL required')
  const urlError = getImportUrlError(url)
  if (urlError) throw new Error(urlError)

  // Short-TTL cache hit (robustness + speed)
  const cached = getCached(url)
  if (cached) return cached

  // Build candidates then filter by robots.txt (best effort)
  let candidates = [url, ...COMMON_PATHS.map(p => normalizeUrl(url, p))]
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .slice(0, 8)

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

  const results = await Promise.allSettled(candidates.map(u => fetchHtmlSafe(u)))
  const htmls: { html: string; u: string }[] = []
  results.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value) htmls.push({ html: r.value, u: candidates[i] })
  })

  if (htmls.length === 0) {
    throw new Error('Could not fetch site or common subpages (robots or network)')
  }

  const primary = htmls[0]
  const titleMatch = primary.html.match(/<title>(.*?)<\/title>/i)
  const title = titleMatch ? titleMatch[1].trim() : 'Imported Business'

  const descMatch = primary.html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
  let description = descMatch ? descMatch[1] : ''
  if (industry && description.length < 15) description = `${industry} services.`

  let rich: OfferItem[] = []
  const links = new Map<string, string>()

  // Shopify special path (high value per user request)
  const shopifyOffers = await tryExtractShopifyProducts(url)
  if (shopifyOffers.length > 0) {
    rich = mergeOffers(rich, shopifyOffers)
  }

  for (const { html, u } of htmls) {
    const ld = extractFromJsonLd(html, u)
    const heur = extractFromHeuristics(html, u, industry)
    const pageLinks = extractBookingLinks(html, u)
    pageLinks.forEach((v, k) => links.set(k, v))
    rich = mergeOffers(rich, [...ld, ...heur])
  }

  // Phase 6: LLM fallback when deterministic extraction is weak (gated on LLM_API_KEY).
  if (rich.length < 2 && isLlmConfigured()) {
    try {
      const llmOffers = await llmExtractOffers(primary.html, industry)
      if (llmOffers.length) rich = mergeOffers(rich, llmOffers)
    } catch {
      // best-effort — deterministic result stands
    }
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

  // Industry seeds — always merge a few high-quality ones when industry is known (stronger industry awareness)
  if (industry) {
    const seeds = industrySeeds(industry, url)
    rich = mergeOffers(rich, seeds.slice(0, 2))
  } else if (rich.length < 3) {
    rich = mergeOffers(rich, industrySeeds(industry, url))
  }

  if (rich.length === 0) {
    rich = [
      { name: 'Main Service', price: 'Starting at $150', description: `Core offering from ${title}.`, url },
      { name: 'Consultation', price: '$75', description: 'Initial discovery call.', duration: '30 min', url },
    ]
  }

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
    const finalConf = Math.min(0.95, baseConf + (relevant && industry ? 0.08 : 0))

    return {
      ...o,
      confidence: finalConf,
    }
  })

  const result: ImportResult = {
    title,
    description: description || `Professional services from ${title}.`,
    website_url: url,
    structuredOffers,
    servicesText,
    industry: industry || null,
    pagesAnalyzed: htmls.length,
  }

  setCached(url, result)
  return result
}
