import { describe, it, expect, vi, beforeEach } from 'vitest'

let rateLimited = false
let urlError: string | null = null
let authUser: { id: string } | null = { id: 'owner-1' }
let insertedResearch: any = null
const analyzeSite = vi.fn()

vi.mock('../../../lib/rate-limit', () => ({
  enforceRateLimit: vi.fn(async () => (rateLimited ? new Response('rate', { status: 429 }) : null)),
}))
vi.mock('../../../lib/importer', () => ({
  analyzeSite: (...args: unknown[]) => analyzeSite(...args),
  getImportUrlError: () => urlError,
}))
vi.mock('../../../lib/observability', () => ({ captureError: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ getAll: () => [], set: () => {} })) }))
vi.mock('../../../utils/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: authUser } })) },
    from: vi.fn(() => {
      const chain: any = {
        insert: vi.fn((value: any) => { insertedResearch = value; return chain }),
        select: vi.fn(() => chain),
        single: vi.fn(async () => ({
          data: insertedResearch ? {
            id: '123e4567-e89b-42d3-a456-426614174000',
            kind: insertedResearch.kind,
            target_url: insertedResearch.target_url,
            target_host: insertedResearch.target_host,
            compared_page_id: null,
            compared_page_slug: null,
            result: insertedResearch.result,
            evidence: insertedResearch.evidence,
            created_at: '2026-08-21T00:00:00.000Z',
          } : null,
          error: null,
        })),
      }
      return chain
    }),
  })),
}))

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
    authUser = { id: 'owner-1' }
    insertedResearch = null
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
    expect(insertedResearch).toBeNull()
  })

  it('saves only when an authenticated user explicitly opts in', async () => {
    const res = await POST(post({ url: 'https://acme.com', save: true }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.savedRun).toMatchObject({ kind: 'url_snapshot', targetHost: 'acme.com' })
    expect(insertedResearch).toMatchObject({ owner_id: 'owner-1', kind: 'url_snapshot' })
    expect(insertedResearch.result).not.toHaveProperty('rawHtml')
    expect(insertedResearch.evidence.source.rawHtmlStored).toBe(false)
    expect(res.headers.get('cache-control')).toBe('private, no-store')
  })

  it('does not allow an anonymous caller to request persistence', async () => {
    authUser = null
    const res = await POST(post({ url: 'https://acme.com', save: true }))
    expect(res.status).toBe(401)
    expect(insertedResearch).toBeNull()
    expect(analyzeSite).not.toHaveBeenCalled()
  })

  it('502 when the crawl fails', async () => {
    analyzeSite.mockRejectedValue(new Error('Could not fetch site'))
    const res = await POST(post({ url: 'https://acme.com' }))
    expect(res.status).toBe(502)
    expect((await res.json()).error).toMatch(/could not fetch/i)
  })
})
