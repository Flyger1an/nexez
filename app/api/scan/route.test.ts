import { describe, it, expect, vi, beforeEach } from 'vitest'

let rateLimited = false
const gatherSiteSignals = vi.fn()

vi.mock('../../../lib/rate-limit', () => ({
  enforceRateLimit: vi.fn(async () => (rateLimited ? new Response('rate', { status: 429 }) : null)),
}))
vi.mock('../../../lib/server/site-scan', () => ({
  gatherSiteSignals: (...a: unknown[]) => gatherSiteSignals(...a),
}))
vi.mock('../../../lib/observability', () => ({ captureEvent: vi.fn(), captureError: vi.fn() }))

import { POST } from './route'

const post = (body: unknown) =>
  new Request('https://nexez.test/api/scan', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

const allowedRobots = {
  GPTBot: true, 'OAI-SearchBot': true, 'ChatGPT-User': true, ClaudeBot: false,
  'Claude-Web': true, PerplexityBot: true, 'Google-Extended': true,
}

describe('POST /api/scan (public anonymous scanner)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    rateLimited = false
  })

  it('429 when rate-limited', async () => {
    rateLimited = true
    expect((await POST(post({ url: 'x.com' }))).status).toBe(429)
    expect(gatherSiteSignals).not.toHaveBeenCalled()
  })

  it('400 on invalid JSON', async () => {
    const bad = new Request('https://nexez.test/api/scan', { method: 'POST', body: 'not json' })
    expect((await POST(bad)).status).toBe(400)
  })

  it('400 when the gatherer rejects the URL (SSRF / bad input)', async () => {
    gatherSiteSignals.mockResolvedValue({ error: 'Blocked private host' })
    const res = await POST(post({ url: 'http://169.254.169.254/' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/blocked/i)
  })

  it('returns score + checks + blockedBots and NO raw page body', async () => {
    gatherSiteSignals.mockResolvedValue({
      url: 'https://acme.com/',
      origin: 'https://acme.com',
      elapsedMs: 120,
      robots: allowedRobots,
      signals: {
        status: 200, responseMs: 120, hasJsonLd: true, hasTitle: true, hasMetaDescription: true,
        hasH1: true, agentJsonOk: true, wellKnownAgentJsonOk: false, llmsTxtOk: true, robots: allowedRobots,
      },
    })
    const res = await POST(post({ url: 'acme.com' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(typeof json.score).toBe('number')
    expect(Array.isArray(json.checks)).toBe(true)
    expect(json.blockedBots).toContain('ClaudeBot')
    // Anti-scraping-relay: never leaks fetched HTML.
    const raw = JSON.stringify(json)
    expect(raw).not.toContain('<html')
    expect(raw).not.toContain('<body')
  })
})
