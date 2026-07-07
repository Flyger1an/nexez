import { describe, it, expect, vi, beforeEach } from 'vitest'

let rateLimited = false
let urlError: string | null = null
const analyzeSite = vi.fn()

vi.mock('../../../lib/rate-limit', () => ({
  enforceRateLimit: vi.fn(async () => (rateLimited ? new Response('rate', { status: 429 }) : null)),
}))
vi.mock('../../../lib/importer', () => ({
  analyzeSite: (...args: unknown[]) => analyzeSite(...args),
  getImportUrlError: () => urlError,
}))
vi.mock('../../../lib/observability', () => ({ captureError: vi.fn() }))

import { POST } from './route'

const post = (body: unknown) =>
  new Request('https://nexez.test/api/simulate-url', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

const crawl = {
  title: 'Acme Plumbing',
  description: 'Emergency plumbing',
  website_url: 'https://acme.com',
  structuredOffers: [{ name: 'Drain cleaning', price: '$120', description: 'fast', url: '' }],
  servicesText: '',
  faqs: [],
  readiness: { score: 60, strengths: [], gaps: [] },
  sources: [{ type: 'schema_org', url: '', label: '', method: '' }],
  pagesAnalyzed: 4,
  confidence: 0.6,
  aiStatus: { configured: false },
}

describe('POST /api/simulate-url (anonymous any-URL demo)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    rateLimited = false
    urlError = null
    analyzeSite.mockResolvedValue(crawl)
  })

  it('400 when no url is provided', async () => {
    expect((await POST(post({}))).status).toBe(400)
  })

  it('400 (not a crawl) when the host is blocked - SSRF guard rejects up front', async () => {
    urlError = 'Website URL cannot target localhost, private networks, or link-local addresses.'
    const res = await POST(post({ url: 'http://169.254.169.254/' }))
    expect(res.status).toBe(400)
    expect(analyzeSite).not.toHaveBeenCalled()
  })

  it('honours the rate limiter', async () => {
    rateLimited = true
    expect((await POST(post({ url: 'https://acme.com' }))).status).toBe(429)
    expect(analyzeSite).not.toHaveBeenCalled()
  })

  it('runs the crawl DETERMINISTICALLY (skipLlm) and returns the comparison', async () => {
    const res = await POST(post({ url: 'https://acme.com' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.host).toBe('acme.com')
    expect(body.agentReady.offerCount).toBe(1)
    expect(body.raw.actionable).toBe(false)
    // The third positional arg must force the no-LLM path for anonymous traffic.
    expect(analyzeSite).toHaveBeenCalledWith('https://acme.com', null, { skipLlm: true })
  })

  it('502 when the crawl fails', async () => {
    analyzeSite.mockRejectedValue(new Error('Could not fetch site'))
    const res = await POST(post({ url: 'https://acme.com' }))
    expect(res.status).toBe(502)
    expect((await res.json()).error).toMatch(/could not fetch/i)
  })
})
