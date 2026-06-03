import { NextResponse } from 'next/server'
import { fetchHtmlSafe, getImportUrlError } from '../../../lib/importer'
import { enforceRateLimit } from '../../../lib/rate-limit'
import {
  AGENT_BOTS,
  evaluateCrawlability,
  parseRobotsForAgentBots,
  type AgentBot,
  type CrawlabilitySignals,
} from '../../../lib/crawlability'

/**
 * B6 — Agent crawlability test.
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

async function probe(url: string): Promise<{ ok: boolean; status: number; ms: number }> {
  const started = Date.now()
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Nexez Crawlability Bot/1.0' },
      signal: AbortSignal.timeout(6500),
    })
    return { ok: res.ok, status: res.status, ms: Date.now() - started }
  } catch {
    return { ok: false, status: 0, ms: Date.now() - started }
  }
}

async function probeJson(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Nexez Crawlability Bot/1.0', Accept: 'application/json' },
      signal: AbortSignal.timeout(6500),
    })
    if (!res.ok) return false
    await res.json()
    return true
  } catch {
    return false
  }
}

export async function POST(request: Request) {
  const limited = enforceRateLimit(request, 'crawlability', 10, 60_000)
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

  // SSRF guard: only public http(s) hosts (blocks localhost/private/link-local).
  const urlError = getImportUrlError(url)
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
