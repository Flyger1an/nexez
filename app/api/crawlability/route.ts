import { NextResponse } from 'next/server'
import { fetchHtmlSafe, getImportUrlError, getResolvedImportUrlError, safeFetch } from '../../../lib/importer'
import { enforceRateLimit } from '../../../lib/rate-limit'

// Multiple external fetches (page + agent.json + llms.txt + robots).
export const maxDuration = 30
import {
  AGENT_BOTS,
  evaluateCrawlability,
  parseRobotsForAgentBots,
  type AgentBot,
  type CrawlabilitySignals,
} from '../../../lib/crawlability'

/**
 * B6 - Agent crawlability test.
 * POST { url } → fetches the public URL + its origin's /agent.json, /llms.txt,
 * /robots.txt and returns a deterministic agent-readiness report. Safe to call
 * for any public URL (only issues GETs, polite UA, short timeouts).
 */

function normalizeUrl(input: string): string | null {
  let u = (input || '').trim()
  if (!u) return null
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`
  try {
    return new URL(u).toString()
  } catch {
    return null
  }
}

// All outbound probes go through safeFetch (DNS-resolve → private-IP block →
// manual, re-validated redirects). The raw fetch() here previously had no SSRF
// guard at all, so a public name resolving to a private IP (localtest.me →
// 127.0.0.1, *.nip.io) turned this into a blind internal port/host oracle via the
// fast-refuse-vs-timeout differential (red-team gauntlet finding).
async function probe(url: string): Promise<{ ok: boolean; status: number; ms: number }> {
  const started = Date.now()
  const res = await safeFetch(url, { headers: { 'User-Agent': 'Nexez Crawlability Bot/1.0' } }, { timeoutMs: 6500 })
  return { ok: !!res && res.ok, status: res?.status ?? 0, ms: Date.now() - started }
}

async function probeJson(url: string): Promise<boolean> {
  const res = await safeFetch(url, { headers: { 'User-Agent': 'Nexez Crawlability Bot/1.0', Accept: 'application/json' } }, { timeoutMs: 6500 })
  if (!res || !res.ok) return false
  try {
    await res.json()
    return true
  } catch {
    return false
  }
}

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, 'crawlability', 10, 60_000)
  if (limited) return limited

  let body: { url?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const url = normalizeUrl(body.url || '')
  if (!url) {
    return NextResponse.json({ error: 'A valid URL is required' }, { status: 400 })
  }

  // SSRF guard: literal host check THEN DNS-resolved private-IP check (the literal
  // check alone let public names that resolve to private IPs through).
  const urlError = getImportUrlError(url) || (await getResolvedImportUrlError(url))
  if (urlError) {
    return NextResponse.json({ error: urlError }, { status: 400 })
  }

  const origin = new URL(url).origin

  const started = Date.now()
  const [html, pageProbe, agentJsonOk, llmsRes, robotsTxt] = await Promise.all([
    fetchHtmlSafe(url),
    probe(url),
    probeJson(`${origin}/agent.json`),
    probe(`${origin}/llms.txt`),
    fetchHtmlSafe(`${origin}/robots.txt`),
  ])

  const lower = (html || '').toLowerCase()
  const robots: Record<AgentBot, boolean> = parseRobotsForAgentBots(robotsTxt)

  const signals: CrawlabilitySignals = {
    status: pageProbe.status,
    responseMs: pageProbe.ms,
    hasJsonLd: lower.includes('application/ld+json'),
    hasTitle: /<title[\s>]/.test(lower),
    hasMetaDescription: /<meta[^>]+name=["']description["']/.test(lower),
    hasH1: /<h1[\s>]/.test(lower),
    agentJsonOk,
    llmsTxtOk: llmsRes.ok,
    robots,
  }

  const report = evaluateCrawlability(signals)

  return NextResponse.json({
    ok: true,
    url,
    origin,
    elapsedMs: Date.now() - started,
    score: report.score,
    checks: report.checks,
    agentBots: AGENT_BOTS,
    blockedBots: AGENT_BOTS.filter((b) => !robots[b]),
  })
}
