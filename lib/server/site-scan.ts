import 'server-only'
import { getImportUrlError, getResolvedImportUrlError, safeFetch } from '../importer'
import { parseRobotsForAgentBots, type AgentBot, type CrawlabilitySignals } from '../crawlability'

/**
 * Shared agent-legibility signal gathering for ANY public URL. Used by both the
 * dashboard crawlability test (/api/crawlability) and the public marketing
 * scanner (/api/scan) so the two can never drift.
 *
 * Every outbound request goes through safeFetch (literal-host guard → DNS-resolved
 * private-IP block → manual, re-validated redirect hops) — the raw fetch() the
 * crawlability route once used was an SSRF oracle (red-team gauntlet finding).
 */

const SCAN_UA = 'Nexez Crawlability Bot/1.0'

// Hard response-body caps. safeFetch bounds time (per-hop timeout) but not SIZE;
// an adversarial or just-huge page could otherwise buffer unbounded bytes via
// .text(). Head-of-document content carries every signal we score.
export const HTML_BYTE_CAP = 512 * 1024
export const ROBOTS_BYTE_CAP = 64 * 1024
export const JSON_BYTE_CAP = 256 * 1024

/**
 * Read a response body up to maxBytes, decoding as UTF-8. Stops pulling from the
 * stream once the cap is reached (truncates the final chunk). Returns null when
 * the body is missing or reading fails.
 */
export async function readBodyCapped(res: Response, maxBytes: number): Promise<string | null> {
  const body = res.body
  if (!body) {
    // Some runtimes (and test mocks) surface no stream; fall back to .text()
    // and slice — the string is already materialized at that point anyway.
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
      /* stream already closed */
    }
  }
}

/** Accepts bare domains (prepends https://); null when unparseable. */
export function normalizeScanUrl(input: string): string | null {
  let u = (input || '').trim()
  if (!u) return null
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`
  try {
    return new URL(u).toString()
  } catch {
    return null
  }
}

async function probe(url: string): Promise<{ ok: boolean; status: number; ms: number }> {
  const started = Date.now()
  const res = await safeFetch(url, { headers: { 'User-Agent': SCAN_UA } }, { timeoutMs: 6500 })
  return { ok: !!res && res.ok, status: res?.status ?? 0, ms: Date.now() - started }
}

async function probeJson(url: string): Promise<boolean> {
  const res = await safeFetch(url, { headers: { 'User-Agent': SCAN_UA, Accept: 'application/json' } }, { timeoutMs: 6500 })
  if (!res || !res.ok) return false
  // Capped read + JSON.parse — never res.json() on an unbounded body.
  const text = await readBodyCapped(res, JSON_BYTE_CAP)
  if (!text) return false
  try {
    JSON.parse(text)
    return true
  } catch {
    return false
  }
}

async function fetchCapped(url: string, maxBytes: number): Promise<string | null> {
  const res = await safeFetch(url, { headers: { 'User-Agent': SCAN_UA } }, { timeoutMs: 6500 })
  if (!res || !res.ok) return null
  const text = await readBodyCapped(res, maxBytes)
  return text && text.length >= 20 ? text : null
}

export type SiteSignalsResult = {
  url: string
  origin: string
  elapsedMs: number
  signals: CrawlabilitySignals
  robots: Record<AgentBot, boolean>
}

/**
 * SSRF-guard then fetch the page + its origin's /agent.json,
 * /.well-known/agent.json, /llms.txt and /robots.txt in parallel, and derive
 * the pure CrawlabilitySignals. Returns { error } for guard/parse failures —
 * callers map that to a 400 without leaking anything about internal hosts.
 */
export async function gatherSiteSignals(rawUrl: string): Promise<SiteSignalsResult | { error: string }> {
  const url = normalizeScanUrl(rawUrl)
  if (!url) return { error: 'A valid URL is required' }

  // Literal host check THEN DNS-resolved private-IP check (the literal check
  // alone let public names resolving to private IPs through).
  const urlError = getImportUrlError(url) || (await getResolvedImportUrlError(url))
  if (urlError) return { error: urlError }

  const origin = new URL(url).origin
  const started = Date.now()

  const [html, pageProbe, agentJsonOk, wellKnownAgentJsonOk, llmsRes, robotsTxt] = await Promise.all([
    // Primary page HTML via the CAPPED reader (streams + truncates at HTML_BYTE_CAP):
    // fetchHtmlSafe buffered the whole body with res.text() before any slice, so an
    // attacker-controlled public host could stream (or gzip-bomb) GBs into a single
    // anonymous /api/scan invocation. readBodyCapped bounds the DECOMPRESSED bytes.
    fetchCapped(url, HTML_BYTE_CAP),
    probe(url),
    probeJson(`${origin}/agent.json`),
    probeJson(`${origin}/.well-known/agent.json`),
    probe(`${origin}/llms.txt`),
    fetchCapped(`${origin}/robots.txt`, ROBOTS_BYTE_CAP),
  ])

  const lower = (html || '').toLowerCase() // already bounded to HTML_BYTE_CAP by fetchCapped
  const robots = parseRobotsForAgentBots(robotsTxt)

  const signals: CrawlabilitySignals = {
    status: pageProbe.status,
    responseMs: pageProbe.ms,
    hasJsonLd: lower.includes('application/ld+json'),
    hasTitle: /<title[\s>]/.test(lower),
    hasMetaDescription: /<meta[^>]+name=["']description["']/.test(lower),
    hasH1: /<h1[\s>]/.test(lower),
    agentJsonOk,
    wellKnownAgentJsonOk,
    llmsTxtOk: llmsRes.ok,
    robots,
  }

  return { url, origin, elapsedMs: Date.now() - started, signals, robots }
}
