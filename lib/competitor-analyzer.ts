/**
 * Nexez Competitor Website Analyzer (New High Priority intelligence feature)
 *
 * Allows pasting ANY competitor website URL (not limited to Nexez pages).
 * Delivers detailed AI-agent perception analysis:
 *  - Overall Agent Trust Score (0-100)
 *  - Parseability Score
 *  - Structured Data Quality (schema/JSON-LD/llms.txt etc.)
 *  - Clarity & Intent Detection
 *  - Missing Information
 *  - Strengths & Weaknesses
 *  - Actionable Recommendations
 *  - Optional side-by-side vs user's own Nexez page
 *
 * Implementation notes followed exactly:
 * - Combination of web scraping (reuse lib/importer.ts polite fetch + robots) + deterministic "LLM-style" analysis (rule-based, consistent with ai-optimize.ts; future real LLM hook noted).
 * - Respectful of robots.txt and rate limits (importer patterns + 48h cache).
 * - Cache results 24-48 hours.
 * - Clean, visual, easy to share/export (MD/JSON).
 *
 * Data flywheel: Every analysis (especially with side-by-side) produces signals that can improve Nexez scoring models, importer heuristics, and Co-Pilot suggestions over time.
 * Modularity: Heavy external analysis + exports can be tiered (Free limited scans, Pro unlimited + history + PDF export, Business team shares) using JSONB flags or future usage counters. No core refactor needed.
 */

import type { OfferItem } from './agent-page'
import { fetchHtmlSafe, isPathAllowed } from './importer'
import { getReadinessScore, getTrustScore } from './agent-page'
import { isLlmConfigured, llmComplete } from './llm'

// Long TTL cache (24-48h per spec). In-memory for MVP; easy to back by Supabase or KV later.
const COMPETITOR_CACHE = new Map<string, { ts: number; result: CompetitorAnalysis }>()
const CACHE_TTL_MS = 48 * 60 * 60 * 1000 // 48 hours

export type CompetitorScores = {
  overall: number // 0-100 "Agent Trust Score" for the site
  parseability: number
  structuredDataQuality: number
  clarityAndIntent: number
}

export type CompetitorAnalysis = {
  url: string
  normalizedUrl: string
  analyzedAt: string
  scores: CompetitorScores
  missing: string[]
  strengths: string[]
  weaknesses: string[]
  recommendations: string[]
  signals: {
    hasJsonLd: boolean
    jsonLdCount: number
    hasLlmsTxt: boolean
    hasAgentJson: boolean
    offerCount: number
    headingCount: number
    hasContact: boolean
    textLength: number
    priceMentions: number
  }
  // Optional side-by-side (when user provides their Nexez page slug)
  userComparison?: {
    slug: string
    readiness: number
    trust: number
    offerCount: number
    summary: string
    winSuggestions: string[]
  }
}

function getCached(key: string): CompetitorAnalysis | null {
  const hit = COMPETITOR_CACHE.get(key)
  if (hit && (Date.now() - hit.ts) < CACHE_TTL_MS) return hit.result
  return null
}

function setCached(key: string, result: CompetitorAnalysis) {
  COMPETITOR_CACHE.set(key, { ts: Date.now(), result })
  // crude eviction
  if (COMPETITOR_CACHE.size > 100) {
    const oldest = Array.from(COMPETITOR_CACHE.entries()).sort((a, b) => a[1].ts - b[1].ts)[0]
    if (oldest) COMPETITOR_CACHE.delete(oldest[0])
  }
}

function normalizeForCache(u: string): string {
  try {
    const url = new URL(u.startsWith('http') ? u : `https://${u}`)
    return `${url.origin}${url.pathname}`.replace(/\/$/, '')
  } catch {
    return u.toLowerCase()
  }
}

// Lightweight structured signals (reuse importer spirit, no heavy deps)
function countJsonLd(html: string): number {
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>/gi
  const matches = html.match(re) || []
  return matches.length
}

function looksLikeHasLlmsSignals(html: string): boolean {
  // Heuristic: presence of "llms.txt" mention or very structured headings + "we offer" patterns
  const t = html.toLowerCase()
  return t.includes('llms.txt') || (t.includes('we offer') && t.includes('pricing')) || t.includes('agent.json')
}

async function checkLlmsTxt(base: string): Promise<boolean> {
  const url = normalizeUrl(base, '/llms.txt')
  const html = await fetchHtmlSafe(url, 4000)
  return !!(html && html.length > 40)
}

async function checkAgentJson(base: string): Promise<boolean> {
  const url = normalizeUrl(base, '/agent.json')
  const html = await fetchHtmlSafe(url, 4000)
  return !!(html && (html.includes('"offers"') || html.includes('application/json')))
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

function extractHeadings(html: string): number {
  const h = html.match(/<h[1-6][^>]*>/gi) || []
  return h.length
}

function extractOffersHeuristic(html: string): { count: number; priceMentions: number } {
  const price = (html.match(/\$[\d,]+|\b\d+\s*(usd|dollars|per|\/hr|\/mo|session|visit)\b/gi) || []).length
  // crude offer detection via common patterns
  const offers = (html.match(/class=("|')[^"']*(service|offer|pricing|book|package)[^"']*("|')|data-.*(price|book)|itemprop=["']?(price|offer)["']?/gi) || []).length
  return { count: Math.min(12, Math.max(0, Math.floor(offers / 2) + (price > 0 ? 1 : 0))), priceMentions: price }
}

function extractContactSignals(html: string): boolean {
  const t = html.toLowerCase()
  return /@|tel:|phone|contact|hello@|book@|email|location|address/.test(t)
}

function computeScores(signals: CompetitorAnalysis['signals'], htmlLen: number): CompetitorScores {
  // Parseability: structure (headings) + text density + actionability hints
  const parseability = Math.round(
    Math.min(100,
      35 * Math.min(1, signals.headingCount / 8) +
      35 * Math.min(1, Math.log10(Math.max(500, htmlLen)) / 4) +
      30 * Math.min(1, (signals.offerCount + signals.priceMentions) / 6)
    )
  )

  // Structured Data Quality: JSON-LD + llms/agent.json presence + basic signals
  let struct = 0
  if (signals.hasJsonLd) struct += 35
  if (signals.jsonLdCount > 2) struct += 15
  if (signals.hasLlmsTxt) struct += 25
  if (signals.hasAgentJson) struct += 15
  if (signals.hasContact) struct += 10
  const structuredDataQuality = Math.min(100, struct)

  // Clarity & Intent: how clearly it says what you get + next step (offer extraction + price + contact)
  const clarity = Math.round(
    Math.min(100,
      40 * Math.min(1, signals.offerCount / 4) +
      30 * Math.min(1, signals.priceMentions / 3) +
      30 * (signals.hasContact ? 1 : 0.6)
    )
  )

  // Overall Agent Trust (0-100) — weighted composite inspired by getTrustScore but for external sites
  // 35% parse + 30% struct + 25% clarity + 10% "trust extras" (contact + reasonable content)
  const overallBase = Math.round(0.35 * parseability + 0.30 * structuredDataQuality + 0.25 * clarity)
  const trustBonus = signals.hasContact ? 5 : 0
  const overall = Math.max(10, Math.min(100, overallBase + trustBonus))

  return { overall, parseability, structuredDataQuality, clarityAndIntent: clarity }
}

async function computeGapsAndRecs(url: string, signals: CompetitorAnalysis['signals'], scores: CompetitorScores): Promise<{
  missing: string[]
  strengths: string[]
  weaknesses: string[]
  recommendations: string[]
}> {
  const missing: string[] = []
  const recs: string[] = []

  if (!signals.hasJsonLd) { missing.push('No visible schema.org / JSON-LD structured data'); recs.push('Add JSON-LD for Service/Offer on key pages (price, duration, url).') }
  if (!signals.hasLlmsTxt && !signals.hasAgentJson) { missing.push('No llms.txt or /agent.json for AI agents'); recs.push('Create /llms.txt and /agent.json summarizing offers, pricing, and booking actions.') }
  if (signals.offerCount < 2) { missing.push('Very few extractable offers/pricing'); recs.push('List 3–8 clear priced offers with explicit next-step URLs.') }
  if (signals.priceMentions < 1) { missing.push('Prices not easily discoverable in text'); recs.push('Surface prices prominently (or clear “from $X” ranges).') }
  if (!signals.hasContact) { missing.push('Weak contact / location / booking signals for agents'); recs.push('Add email, phone, service area, and direct booking CTA.') }
  if (signals.headingCount < 4) { missing.push('Sparse heading structure (hard for agents to parse sections)'); recs.push('Use clear H1/H2 for “Services”, “Pricing”, “How it works”.') }

  const strengths: string[] = []
  if (signals.hasJsonLd) strengths.push('Has structured JSON-LD data — agents can parse offers reliably')
  if (signals.hasLlmsTxt || signals.hasAgentJson) strengths.push('Has AI-native files (llms.txt / agent.json) — excellent for agent consumption')
  if (signals.offerCount >= 3 && signals.priceMentions >= 1) strengths.push('Multiple priced offers visible — good clarity for comparison')
  if (signals.hasContact) strengths.push('Clear contact/booking path present')

  const weaknesses: string[] = []
  if (scores.parseability < 55) weaknesses.push('Content may be hard for agents to chunk and understand (improve headings + scannability)')
  if (scores.structuredDataQuality < 45) weaknesses.push('Missing modern agent signals (JSON-LD, llms.txt)')
  if (scores.clarityAndIntent < 50) weaknesses.push('Intent and next steps are ambiguous to machine readers')

  // Always give 2–4 concrete recs
  if (recs.length === 0) recs.push('Add duration + service area to offers for consumer/local services.', 'Run Nexez importer + Co-Pilot on your own site for instant parity.')

  // Advanced LLM refinement (using the platform's configured LLM when available) for contextual recommendations
  let finalRecs = recs.slice(0, 6)
  if (isLlmConfigured()) {
    try {
      const insight = await llmComplete(`Given this competitor analysis for ${url}: missing ${missing.join(', ')}; strengths ${strengths.join(', ')}; weaknesses ${weaknesses.join(', ')}. Give 3 specific, actionable recommendations for the site owner to improve AI agent discoverability and conversion. Keep short.`, { maxTokens: 180 })
      if (insight) finalRecs = [...finalRecs, ...insight.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 3)]
    } catch {}
  }

  return {
    missing: missing.length ? missing : ['No major gaps detected — strong agent surface.'],
    strengths: strengths.length ? strengths : ['Basic content present.'],
    weaknesses: weaknesses.length ? weaknesses : ['Minor polish opportunities only.'],
    recommendations: finalRecs,
  }
}

/**
 * Main entry: analyze any public website URL for agent perception.
 * Respects robots (best effort via importer), uses polite fetch + timeouts, 48h cache.
 */
export async function analyzeCompetitorSite(
  url: string,
  opts?: { userNexezPage?: { slug: string; name?: string; readiness?: number; trust?: number; offerCount?: number; description?: string } | null }
): Promise<CompetitorAnalysis> {
  const normalized = normalizeForCache(url)
  const cached = getCached(normalized)
  if (cached) {
    // attach fresh side-by-side if provided this call (cache is for the external site itself)
    if (opts?.userNexezPage) {
      return {
        ...cached,
        userComparison: opts.userNexezPage ? {
          slug: opts.userNexezPage.slug,
          readiness: opts.userNexezPage.readiness || 0,
          trust: opts.userNexezPage.trust || 0,
          offerCount: opts.userNexezPage.offerCount || 0,
          summary: (opts.userNexezPage.description || '').slice(0, 140),
          winSuggestions: ['Add the missing structured signals the competitor lacks.', 'Use Co-Pilot to close any clarity gaps.'],
        } : undefined,
      }
    }
    return cached
  }

  // Respectful fetch of root + key paths (reuse importer)
  let html: string | null = null
  const base = url.startsWith('http') ? url : `https://${url}`
  const candidates = ['/', '/services', '/pricing', '/about', '/contact']
  for (const p of candidates) {
    const allowed = await isPathAllowed(base, p).catch(() => true)
    if (!allowed) continue
    const candidateUrl = normalizeUrl(base, p)
    html = await fetchHtmlSafe(candidateUrl, 6500)
    if (html && html.length > 200) break
  }

  if (!html) {
    // graceful degraded result
    const degraded: CompetitorAnalysis = {
      url,
      normalizedUrl: normalized,
      analyzedAt: new Date().toISOString(),
      scores: { overall: 22, parseability: 30, structuredDataQuality: 10, clarityAndIntent: 25 },
      missing: ['Unable to fetch meaningful content (robots, JS-heavy, or timeout)'],
      strengths: [],
      weaknesses: ['Site appears opaque to agents — high risk of being ignored'],
      recommendations: ['Ensure server-rendered content or clean HTML for /services and /pricing.', 'Add llms.txt and JSON-LD.'],
      signals: { hasJsonLd: false, jsonLdCount: 0, hasLlmsTxt: false, hasAgentJson: false, offerCount: 0, headingCount: 0, hasContact: false, textLength: 0, priceMentions: 0 },
    }
    setCached(normalized, degraded)
    return degraded
  }

  const textLen = html.length
  const jsonLdCount = countJsonLd(html)
  const hasLlms = await checkLlmsTxt(base).catch(() => false)
  const hasAgent = await checkAgentJson(base).catch(() => false)
  const { count: offerCount, priceMentions } = extractOffersHeuristic(html)
  const headingCount = extractHeadings(html)
  const hasContact = extractContactSignals(html)

  const signals: CompetitorAnalysis['signals'] = {
    hasJsonLd: jsonLdCount > 0,
    jsonLdCount,
    hasLlmsTxt: hasLlms,
    hasAgentJson: hasAgent,
    offerCount,
    headingCount,
    hasContact,
    textLength: textLen,
    priceMentions,
  }

  const scores = computeScores(signals, textLen)
  const { missing, strengths, weaknesses, recommendations } = await computeGapsAndRecs(normalized, signals, scores)

  const result: CompetitorAnalysis = {
    url,
    normalizedUrl: normalized,
    analyzedAt: new Date().toISOString(),
    scores,
    missing,
    strengths,
    weaknesses,
    recommendations,
    signals,
  }

  // Attach side-by-side comparison if caller supplied a Nexez page summary
  if (opts?.userNexezPage) {
    result.userComparison = {
      slug: opts.userNexezPage.slug,
      readiness: opts.userNexezPage.readiness || 0,
      trust: opts.userNexezPage.trust || 0,
      offerCount: opts.userNexezPage.offerCount || 0,
      summary: (opts.userNexezPage.description || '').slice(0, 160),
      winSuggestions: [
        scores.structuredDataQuality < 60 ? 'Add JSON-LD + llms.txt (competitor may be weak here too)' : 'Leverage your existing structured data advantage.',
        scores.clarityAndIntent < 65 ? 'Run AI Co-Pilot on your offers for clearer intent signals' : 'Your clarity is competitive — push pricing tiers + consumer fields.',
      ],
    }
  }

  setCached(normalized, result)
  return result
}

/**
 * Convenience: produce a clean Markdown report from analysis (for export/share).
 */
export function analysisToMarkdown(a: CompetitorAnalysis): string {
  let md = `# Competitor Website Agent Analysis\n\n`
  md += `**URL**: ${a.url}\n`
  md += `**Analyzed**: ${a.analyzedAt}\n\n`
  md += `## Overall Agent Trust Score: ${a.scores.overall}/100\n\n`
  md += `- Parseability: ${a.scores.parseability}\n`
  md += `- Structured Data Quality: ${a.scores.structuredDataQuality}\n`
  md += `- Clarity & Intent: ${a.scores.clarityAndIntent}\n\n`
  md += `## Missing Information\n${a.missing.map(m => `- ${m}`).join('\n')}\n\n`
  md += `## Strengths\n${a.strengths.map(s => `- ${s}`).join('\n')}\n\n`
  md += `## Weaknesses\n${a.weaknesses.map(w => `- ${w}`).join('\n')}\n\n`
  md += `## Actionable Recommendations\n${a.recommendations.map(r => `- ${r}`).join('\n')}\n\n`
  if (a.userComparison) {
    md += `## Side-by-Side vs Your Nexez Page (/${a.userComparison.slug})\n`
    md += `- Your Readiness: ${a.userComparison.readiness} | Trust: ${a.userComparison.trust}\n`
    md += `- Suggestions vs competitor: ${a.userComparison.winSuggestions.join(' ')}\n\n`
  }
  md += `---\nGenerated by Nexez Competitor Website Analyzer. Use these insights to improve your agent-optimized page.`
  return md
}

export function analysisToJSON(a: CompetitorAnalysis): string {
  return JSON.stringify(a, null, 2)
}

// Re-export a couple importer helpers for consumers if needed
export { fetchHtmlSafe, isPathAllowed } from './importer'
