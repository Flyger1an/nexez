import { afterEach, describe, expect, it, vi } from 'vitest'
import { analyzeSite } from '../importer'

function serviceNodes(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const serviceNumber = index + 1
    return {
      '@type': 'Service',
      name: `Agent Offer ${serviceNumber}`,
      price: `$${serviceNumber * 100}`,
      description: [
        `Agent Offer ${serviceNumber} is a focused implementation package for teams that need an agent-readable offer page, booking path, and clear purchase next step.`,
        'It includes discovery, setup, launch support, and measurement details that should stay concise on the final public agent card.',
        'Read more click here contact contact contact and browse unrelated navigation links.',
      ].join(' '),
      url: `https://example.com/services/agent-offer-${serviceNumber}`,
    }
  })
}

function htmlWithOffers(count: number) {
  return `<!doctype html>
    <html>
      <head>
        <title>Example Strategy Studio</title>
        <meta name="description" content="Consulting services for agent-ready pages.">
        <script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': serviceNodes(count) })}</script>
      </head>
      <body><h1>Services</h1><a href="/book">Book a consult</a></body>
    </html>`
}

function evidenceFromLlmRequest(init?: RequestInit) {
  const request = JSON.parse(String(init?.body || '{}'))
  const prompt = String(request.messages?.at(-1)?.content || '')
  const marker = 'Evidence bundle:\n'
  const start = prompt.lastIndexOf(marker)
  return start >= 0 ? JSON.parse(prompt.slice(start + marker.length)) as Array<{ id: string; field: string; value: string }> : []
}

function evidenceIdsFor(evidence: Array<{ id: string; field: string }>, field: string) {
  return evidence.filter((item) => item.field === field).map((item) => item.id)
}

describe('analyzeSite importer normalization', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.LLM_API_KEY
    delete process.env.LLM_BASE_URL
    delete process.env.LLM_MODEL
  })

  it('caps imported offers at 12 and summarizes descriptions for agent cards', async () => {
    delete process.env.LLM_API_KEY
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (/robots\.txt|sitemap\.xml|llms\.txt|agent\.json|nexez\.json|products\.json/i.test(url)) {
        return new Response('', { status: 404 })
      }
      return new Response(htmlWithOffers(14), {
        status: 200,
        headers: { 'content-type': 'text/html' },
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await analyzeSite('https://example.com/services', {
      targetBuyer: 'founders evaluating AI-ready services',
      desiredAction: 'Book appointments',
      offerFocus: 'agent',
      location: 'Remote',
    })

    expect(result.structuredOffers).toHaveLength(12)
    expect(result.structuredOffers?.every((offer) => (offer.description || '').length <= 260)).toBe(true)
    expect(result.structuredOffers?.every((offer) => !/read more|click here/i.test(offer.description || ''))).toBe(true)
    const returnedEvidenceIds = new Set(result.evidence.map((item) => item.id))
    expect(result.structuredOffers.every((offer) => (
      (offer.metadata?.evidenceIds || []).every((id: string) => returnedEvidenceIds.has(id))
    ))).toBe(true)
    expect(result.structuredOffers?.[0]?.serviceArea).toBe('Remote')
    expect(result.aiStatus).toMatchObject({
      configured: false,
      attempted: false,
      used: false,
      status: 'deterministic',
    })
  })

  it('uses answered clarifying questions to refine deterministic imports', async () => {
    delete process.env.LLM_API_KEY
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (/robots\.txt|sitemap\.xml|llms\.txt|agent\.json|nexez\.json|products\.json/i.test(url)) {
        return new Response('', { status: 404 })
      }
      return new Response(htmlWithOffers(3), {
        status: 200,
        headers: { 'content-type': 'text/html' },
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await analyzeSite('https://refined.example.com/services', {
      clarifyingAnswers: [
        {
          id: 'service-area',
          field: 'location',
          question: 'What location or service area should agents mention?',
          answer: 'Dallas and Fort Worth',
        },
        {
          id: 'target-buyer',
          field: 'audience',
          question: 'Who should AI agents recommend this listing to first?',
          answer: 'funded SaaS founders',
        },
      ],
    })

    expect(result.location).toBe('Dallas and Fort Worth')
    expect(result.audience).toBe('funded SaaS founders')
    expect(result.structuredOffers?.[0]?.serviceArea).toBe('Dallas and Fort Worth')
    expect(result.description).toMatch(/owner-provided context/i)
    expect(result.reviewNotes).toContain('2 owner answers applied to refine this draft.')
  })

  it('reports when structured AI extraction contributes to an import', async () => {
    process.env.LLM_API_KEY = 'sk-test'
    process.env.LLM_BASE_URL = 'https://llm.example.com/v1'
    process.env.LLM_MODEL = 'agent-draft-v1'
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/chat/completions')) {
        const evidence = evidenceFromLlmRequest(init)
        const offerIds = evidence.filter((item) => item.field.startsWith('offers.0.')).map((item) => item.id)
        const actionIds = evidenceIdsFor(evidence, 'action.book')
        return new Response(JSON.stringify({
          choices: [{
            message: {
              content: JSON.stringify({
                title: 'Example Strategy Studio',
                description: 'Consulting services for agent-ready operators.',
                audience: 'service operators',
                industry: 'Consulting & Strategy',
                cta_label: 'Book consultation',
                cta_url: 'https://ai.example.com/book',
                citations: {
                  title: evidenceIdsFor(evidence, 'business.name'),
                  description: evidenceIdsFor(evidence, 'business.description'),
                  audience: evidenceIdsFor(evidence, 'audience'),
                  industry: [...evidenceIdsFor(evidence, 'business.name'), ...evidenceIdsFor(evidence, 'business.description')],
                  cta_label: actionIds,
                  cta_url: actionIds,
                },
                offers: [{
                  name: 'Agent Offer 1',
                  price: '$100',
                  description: 'Agent Offer 1 is a focused implementation package.',
                  url: 'https://example.com/services/agent-offer-1',
                  confidence: 0.91,
                  evidence_ids: offerIds,
                }],
                faqs: [],
                clarifyingQuestions: [],
                reviewNotes: ['Model found one high-confidence offer.'],
              }),
            },
          }],
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      if (/robots\.txt|sitemap\.xml|llms\.txt|agent\.json|nexez\.json|products\.json/i.test(url)) {
        return new Response('', { status: 404 })
      }
      return new Response(htmlWithOffers(1), {
        status: 200,
        headers: { 'content-type': 'text/html' },
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await analyzeSite('https://ai.example.com/services', {
      targetBuyer: 'operators',
      desiredAction: 'Book appointments',
    })

    expect(result.title).toBe('Example Strategy Studio')
    expect(result.cta_url).toBe('https://ai.example.com/book')
    expect(result.aiStatus).toMatchObject({
      configured: true,
      attempted: true,
      used: true,
      status: 'structured_ai',
      provider: 'llm.example.com',
      model: 'agent-draft-v1',
    })
    expect(result.reviewNotes?.some((note) => note.includes('Structured AI extraction contributed'))).toBe(true)
    expect(result.structuredOffers.some((offer) => offer.name === 'Agent Offer 1')).toBe(true)
    expect(result.evidence.some((item) => item.status === 'inferred' && item.method.includes('AI'))).toBe(true)
  })

  it('reports AI fallback when a configured model returns unusable draft output', async () => {
    process.env.LLM_API_KEY = 'sk-test'
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/chat/completions')) {
        return new Response(JSON.stringify({
          choices: [{ message: { content: 'not json' } }],
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      if (/robots\.txt|sitemap\.xml|llms\.txt|agent\.json|nexez\.json|products\.json/i.test(url)) {
        return new Response('', { status: 404 })
      }
      return new Response(htmlWithOffers(3), {
        status: 200,
        headers: { 'content-type': 'text/html' },
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await analyzeSite('https://fallback.example.com/services')

    expect(result.structuredOffers.length).toBeGreaterThan(0)
    expect(result.aiStatus).toMatchObject({
      configured: true,
      attempted: true,
      used: false,
      status: 'fallback',
    })
    expect(result.reviewNotes?.some((note) => note.includes('AI extraction was attempted'))).toBe(true)
  })

  it('rejects unsupported AI facts even when the model cites an unrelated evidence ID', async () => {
    process.env.LLM_API_KEY = 'sk-test'
    process.env.LLM_BASE_URL = 'https://llm.example.com/v1'
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const requested = String(input)
      if (requested.includes('/chat/completions')) {
        const evidence = evidenceFromLlmRequest(init)
        const unrelated = evidenceIdsFor(evidence, 'business.name')
        return new Response(JSON.stringify({
          choices: [{
            message: {
              content: JSON.stringify({
                title: 'Invented Luxury Empire',
                location: 'Paris, France',
                cta_url: 'https://evil.example/checkout',
                citations: { title: unrelated, location: unrelated, cta_url: unrelated },
                offers: [{
                  name: 'Private Jet Membership',
                  price: '$50,000',
                  description: 'Unlimited private jet travel.',
                  url: 'https://evil.example/checkout',
                  evidence_ids: unrelated,
                }],
                faqs: [],
                clarifyingQuestions: [],
              }),
            },
          }],
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      if (/robots\.txt|sitemap\.xml|llms\.txt|agent\.json|nexez\.json|products\.json/i.test(requested)) {
        return new Response('', { status: 404 })
      }
      return new Response(htmlWithOffers(1), { status: 200, headers: { 'content-type': 'text/html' } })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await analyzeSite('https://adversarial-ai-v2.example.com/', null)

    expect(result.title).toBe('Example Strategy Studio')
    expect(result.location).toBeNull()
    expect(result.cta_url).not.toContain('evil.example')
    expect(result.structuredOffers.some((offer) => offer.name === 'Private Jet Membership')).toBe(false)
    expect(result.evidence.some((item) => item.value.includes('Private Jet'))).toBe(false)
    expect(result.aiStatus.used).toBe(false)
  })

  it('never serves an entitled AI import from cache to a deterministic-only caller', async () => {
    process.env.LLM_API_KEY = 'sk-test'
    process.env.LLM_BASE_URL = 'https://llm.example.com/v1'
    let llmCalls = 0
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/chat/completions')) {
        llmCalls += 1
        const evidence = evidenceFromLlmRequest(init)
        return new Response(JSON.stringify({
          choices: [{
            message: {
              content: JSON.stringify({
                title: 'Example Strategy Studio',
                description: 'Consulting services for agent-ready teams.',
                citations: {
                  title: evidenceIdsFor(evidence, 'business.name'),
                  description: evidenceIdsFor(evidence, 'business.description'),
                },
                offers: [],
              }),
            },
          }],
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      if (/robots\.txt|sitemap\.xml|llms\.txt|agent\.json|nexez\.json|products\.json/i.test(url)) {
        return new Response('', { status: 404 })
      }
      return new Response(htmlWithOffers(1), {
        status: 200,
        headers: { 'content-type': 'text/html' },
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const aiResult = await analyzeSite('https://cache-plan-boundary.example.com/services')
    const deterministicResult = await analyzeSite(
      'https://cache-plan-boundary.example.com/services',
      null,
      { skipLlm: true },
    )

    expect(aiResult.title).toBe('Example Strategy Studio')
    expect(aiResult.description).not.toBe(deterministicResult.description)
    expect(deterministicResult.title).toBe('Example Strategy Studio')
    expect(deterministicResult.aiStatus).toMatchObject({ attempted: false, used: false, status: 'deterministic' })
    expect(llmCalls).toBe(1)
  })

  it('keeps unsupported starter ideas separate from detected offers', async () => {
    delete process.env.LLM_API_KEY
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (/robots\.txt|sitemap\.xml|llms\.txt|agent\.json|nexez\.json|products\.json/i.test(url)) {
        return new Response('', { status: 404 })
      }
      return new Response(
        '<!doctype html><html><head><title>Northstar Studio</title><meta name="description" content="Welcome to Northstar Studio."></head><body><p>Welcome to Northstar.</p></body></html>',
        { status: 200, headers: { 'content-type': 'text/html' } },
      )
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await analyzeSite('https://thin-import-v2.example.com/')

    expect(result.structuredOffers).toEqual([])
    expect(result.confidence).toBe(0)
    expect(result.logo_url).toBeNull()
    expect(result.suggestedOffers).toHaveLength(2)
    expect(result.suggestedOffers.every((offer) => offer.confidence === 0)).toBe(true)
    expect(result.suggestedOffers.every((offer) => offer.metadata?.evidenceStatus === 'suggested')).toBe(true)
    expect(result.clarifyingQuestions).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'missing-offers' }),
    ]))
    expect(result.reviewNotes).toEqual(expect.arrayContaining([
      expect.stringMatching(/No offers were labeled as detected/i),
    ]))
  })

  it('keeps page-specific imports in separate cache entries', async () => {
    delete process.env.LLM_API_KEY
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (/robots\.txt|sitemap\.xml|llms\.txt|agent\.json|nexez\.json|products\.json/i.test(url)) {
        return new Response('', { status: 404 })
      }
      const title = url.endsWith('/pricing-special') ? 'Pricing Source' : url.endsWith('/services-special') ? 'Services Source' : 'Common Source'
      return new Response(`<!doctype html><html><head><title>${title}</title></head><body><p>Ordinary company information for buyers.</p></body></html>`, {
        status: 200,
        headers: { 'content-type': 'text/html' },
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const services = await analyzeSite('https://cache-path-v2.example.com/services-special', null, { skipLlm: true })
    const pricing = await analyzeSite('https://cache-path-v2.example.com/pricing-special', null, { skipLlm: true })

    expect(services.title).toBe('Services Source')
    expect(pricing.title).toBe('Pricing Source')
  })

  it('balances sitemap pages with common paths and fetches robots once', async () => {
    delete process.env.LLM_API_KEY
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/robots.txt')) {
        return new Response('User-agent: *\nAllow: /\n# importer policy', { status: 200 })
      }
      if (url.endsWith('/sitemap.xml')) {
        return new Response('<urlset><url><loc>https://sitemap-v2.example.com/custom-offer-page</loc></url></urlset>', { status: 200 })
      }
      if (/llms\.txt|agent\.json|nexez\.json|products\.json/i.test(url)) {
        return new Response('', { status: 404 })
      }
      const graph = url.endsWith('/custom-offer-page')
        ? `<script type="application/ld+json">${JSON.stringify({ '@type': 'Service', name: 'Sitemap-only Service', price: '$240', description: 'A service available only on the sitemap-discovered page.', url })}</script>`
        : ''
      return new Response(`<!doctype html><html><head><title>Sitemap Business</title>${graph}</head><body><p>Business information and booking details.</p></body></html>`, {
        status: 200,
        headers: { 'content-type': 'text/html' },
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await analyzeSite('https://sitemap-v2.example.com/', null, { skipLlm: true })

    expect(result.structuredOffers).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Sitemap-only Service' }),
    ]))
    expect(result.structuredOffers.some((offer) => offer.name === 'Business information and booking details.')).toBe(false)
    expect(fetchMock.mock.calls.filter(([input]) => String(input).endsWith('/robots.txt'))).toHaveLength(1)
  })

  it('does not misclassify years or durations as prices', async () => {
    delete process.env.LLM_API_KEY
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (/robots\.txt|sitemap\.xml|llms\.txt|agent\.json|nexez\.json|products\.json/i.test(url)) {
        return new Response('', { status: 404 })
      }
      return new Response('<!doctype html><html><head><title>Planning Studio</title></head><body><h2>Book our 2026 planning session for 60 minutes</h2></body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await analyzeSite('https://price-guard-v2.example.com/', null, { skipLlm: true })
    const offer = result.structuredOffers.find((item) => item.name.includes('2026'))

    expect(offer).toBeDefined()
    expect(offer?.price).toBe('Custom')
    expect(offer?.duration).toBe('60 minute')
    expect(offer?.confidence).toBeLessThanOrEqual(0.72)
  })

  it('follows a robots sitemap directive through a nested sitemap index', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const requested = String(input)
      if (requested.endsWith('/robots.txt')) {
        return new Response('User-agent: *\nAllow: /\nSitemap: https://nested-map-v2.example.com/sitemap-index.xml', { status: 200 })
      }
      if (requested.endsWith('/sitemap-index.xml')) {
        return new Response('<sitemapindex><sitemap><loc>https://nested-map-v2.example.com/services-sitemap.xml</loc></sitemap></sitemapindex>', { status: 200 })
      }
      if (requested.endsWith('/services-sitemap.xml')) {
        return new Response('<urlset><url><loc>https://nested-map-v2.example.com/executive-offer</loc></url></urlset>', { status: 200 })
      }
      if (/sitemap\.xml|wp-sitemap\.xml|llms\.txt|agent\.json|nexez\.json/i.test(requested)) {
        return new Response('', { status: 404 })
      }
      const offer = requested.endsWith('/executive-offer')
        ? `<script type="application/ld+json">${JSON.stringify({ '@type': 'Service', name: 'Executive Offer', price: '$950', description: 'A structured executive advisory engagement.', url: requested })}</script>`
        : ''
      return new Response(`<!doctype html><html><head><title>Nested Map Studio</title>${offer}</head><body><p>${requested}</p></body></html>`, { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await analyzeSite('https://nested-map-v2.example.com/', null, { skipLlm: true })

    expect(result.structuredOffers).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Executive Offer' }),
    ]))
    expect(result.sources).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'sitemap', url: 'https://nested-map-v2.example.com/executive-offer' }),
    ]))
  })

  it('uses high-signal links from the entry page as crawl candidates', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const requested = String(input)
      if (/robots\.txt|sitemap\.xml|wp-sitemap\.xml|llms\.txt|agent\.json|nexez\.json/i.test(requested)) {
        return new Response('', { status: 404 })
      }
      if (requested.endsWith('/tailored-engagement')) {
        return new Response(`<!doctype html><html><head><title>Tailored Engagement</title><script type="application/ld+json">${JSON.stringify({ '@type': 'Service', name: 'Tailored Engagement', price: '$640', description: 'A tailored service discovered from verified navigation.', url: requested })}</script></head><body><h1>Tailored Engagement</h1></body></html>`, { status: 200 })
      }
      if (requested === 'https://internal-link-v2.example.com/') {
        return new Response('<!doctype html><html><head><title>Internal Link Studio</title></head><body><a href="/tailored-engagement">View service pricing</a></body></html>', { status: 200 })
      }
      return new Response(`<!doctype html><html><head><title>Internal Link Studio</title></head><body><p>${requested}</p></body></html>`, { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await analyzeSite('https://internal-link-v2.example.com/', null, { skipLlm: true })

    expect(result.structuredOffers).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Tailored Engagement' }),
    ]))
    expect(result.sources).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'internal_link', url: 'https://internal-link-v2.example.com/tailored-engagement' }),
    ]))
  })

  it('canonicalizes tracking links before scheduling page fetches', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const requested = String(input)
      if (/robots\.txt|sitemap\.xml|wp-sitemap\.xml|llms\.txt|agent\.json|nexez\.json/i.test(requested)) {
        return new Response('', { status: 404 })
      }
      if (requested === 'https://tracking-links-v2.example.com/') {
        return new Response('<!doctype html><html><head><title>Tracking Studio</title></head><body><a href="/pricing?utm_source=nav">Pricing</a><a href="/pricing?utm_source=footer">View pricing</a></body></html>', { status: 200 })
      }
      return new Response(`<!doctype html><html><head><title>Tracking Studio</title></head><body><p>${requested}</p></body></html>`, { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    await analyzeSite('https://tracking-links-v2.example.com/', null, { skipLlm: true })

    const pricingRequests = fetchMock.mock.calls.filter(([input]) => new URL(String(input)).pathname === '/pricing')
    expect(pricingRequests).toHaveLength(1)
    expect(String(pricingRequests[0]?.[0])).toBe('https://tracking-links-v2.example.com/pricing')
  })

  it('counts duplicate HTML once even when multiple paths mirror it', async () => {
    const duplicateHtml = '<!doctype html><html><head><title>Mirrored Studio</title></head><body><p>The same response is served for every route.</p></body></html>'
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const requested = String(input)
      if (/robots\.txt|sitemap\.xml|wp-sitemap\.xml|llms\.txt|agent\.json|nexez\.json/i.test(requested)) {
        return new Response('', { status: 404 })
      }
      return new Response(duplicateHtml, { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await analyzeSite('https://duplicate-pages-v2.example.com/', null, { skipLlm: true })

    expect(result.pagesAnalyzed).toBe(1)
    expect(result.telemetry).toMatchObject({
      importerVersion: '2.0.0',
      cacheHit: false,
      pagesUsed: 1,
    })
    expect(result.telemetry.sourceFingerprint).toMatch(/^[a-f0-9]{64}$/)
    expect(result.telemetry.skippedPages.some((item) => item.reason === 'duplicate')).toBe(true)
  })

  it('marks cache hits without losing source telemetry', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const requested = String(input)
      if (/robots\.txt|sitemap\.xml|wp-sitemap\.xml|llms\.txt|agent\.json|nexez\.json/i.test(requested)) return new Response('', { status: 404 })
      return new Response('<!doctype html><html><head><title>Cache Telemetry Studio</title></head><body><p>Public business profile.</p></body></html>', { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const first = await analyzeSite('https://cache-telemetry-v2.example.com/', null, { skipLlm: true })
    const callCount = fetchMock.mock.calls.length
    const second = await analyzeSite('https://cache-telemetry-v2.example.com/', null, { skipLlm: true })

    expect(first.telemetry.cacheHit).toBe(false)
    expect(second.telemetry.cacheHit).toBe(true)
    expect(second.telemetry.sourceFingerprint).toBe(first.telemetry.sourceFingerprint)
    expect(fetchMock).toHaveBeenCalledTimes(callCount)
  })

  it('retries one transient upstream response before failing the page', async () => {
    let entryAttempts = 0
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const requested = String(input)
      if (/robots\.txt|sitemap\.xml|wp-sitemap\.xml|llms\.txt|agent\.json|nexez\.json/i.test(requested)) return new Response('', { status: 404 })
      if (requested === 'https://transient-retry-v2.example.com/') {
        entryAttempts += 1
        if (entryAttempts === 1) return new Response('Try again', { status: 503 })
      }
      return new Response('<!doctype html><html><head><title>Recovered Studio</title></head><body><p>Recovered public profile.</p></body></html>', { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await analyzeSite('https://transient-retry-v2.example.com/', null, { skipLlm: true })

    expect(entryAttempts).toBe(2)
    expect(result.title).toBe('Recovered Studio')
  })

  it('retries a network failure for a discovered critical page', async () => {
    let contactAttempts = 0
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const requested = String(input)
      if (/robots\.txt|sitemap\.xml|wp-sitemap\.xml|llms\.txt|agent\.json|nexez\.json/i.test(requested)) return new Response('', { status: 404 })
      if (requested === 'https://critical-retry-v2.example.com/contact') {
        contactAttempts += 1
        if (contactAttempts === 1) throw new Error('temporary connection failure')
        return new Response('<!doctype html><html><head><title>Contact</title></head><body><a href="mailto:team@critical-retry.example">Email our team</a></body></html>', { status: 200 })
      }
      if (requested === 'https://critical-retry-v2.example.com/') {
        return new Response('<!doctype html><html><head><title>Critical Retry Studio</title></head><body><a href="/contact">Contact</a></body></html>', { status: 200 })
      }
      return new Response('', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await analyzeSite('https://critical-retry-v2.example.com/', null, { skipLlm: true })

    expect(contactAttempts).toBe(2)
    expect(result.businessDetails.email).toBe('team@critical-retry.example')
    expect(result.telemetry.skippedPages.some((item) => item.url.endsWith('/contact'))).toBe(false)
  })

  it('limits candidate page fetches to four concurrent requests per import', async () => {
    let active = 0
    let maxActive = 0
    const serviceLinks = Array.from({ length: 8 }, (_, index) => `<a href="/services/offer-${index + 1}">Service ${index + 1}</a>`).join('')
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const requested = String(input)
      if (/robots\.txt|sitemap\.xml|wp-sitemap\.xml|llms\.txt|agent\.json|nexez\.json/i.test(requested)) return new Response('', { status: 404 })
      if (requested === 'https://bounded-crawl-v2.example.com/') {
        return new Response(`<!doctype html><html><head><title>Bounded Crawl</title></head><body>${serviceLinks}</body></html>`, { status: 200 })
      }
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise((resolve) => setTimeout(resolve, 8))
      active -= 1
      return new Response(`<!doctype html><html><head><title>Offer</title></head><body><p>${requested}</p></body></html>`, { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    await analyzeSite('https://bounded-crawl-v2.example.com/', null, { skipLlm: true })

    expect(maxActive).toBeGreaterThan(1)
    expect(maxActive).toBeLessThanOrEqual(4)
  })

  it('probes the Shopify product feed only when the site identifies as Shopify', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const requested = String(input)
      if (/robots\.txt|sitemap\.xml|wp-sitemap\.xml|llms\.txt|agent\.json|nexez\.json/i.test(requested)) {
        return new Response('', { status: 404 })
      }
      if (requested.includes('/products.json')) {
        return new Response(JSON.stringify({ products: [{ title: 'Merchant Kit', handle: 'merchant-kit', body_html: '<p>A complete merchant kit.</p>', variants: [{ price: '129.00' }] }] }), { status: 200 })
      }
      const marker = requested.includes('shopify-probe-v2') ? '<script src="https://cdn.shopify.com/storefront.js"></script>' : ''
      return new Response(`<!doctype html><html><head><title>Merchant Store</title>${marker}</head><body><p>${requested}</p></body></html>`, { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const regular = await analyzeSite('https://ordinary-probe-v2.example.com/', null, { skipLlm: true })
    const shopify = await analyzeSite('https://shopify-probe-v2.example.com/', null, { skipLlm: true })

    expect(regular.structuredOffers.some((offer) => offer.name === 'Merchant Kit')).toBe(false)
    expect(shopify.structuredOffers).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Merchant Kit', price: '$129' }),
    ]))
    const productRequests = fetchMock.mock.calls.filter(([input]) => String(input).includes('/products.json'))
    expect(productRequests).toHaveLength(1)
    expect(String(productRequests[0]?.[0])).toContain('shopify-probe-v2.example.com')
  })

  it('extracts rich schema evidence without flattening products into services', async () => {
    const graph = {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'Product',
          name: 'Field Operations Kit',
          description: 'A stocked field kit for service teams.',
          url: '/products/field-kit',
          offers: [
            { '@type': 'Offer', name: 'Standard', price: '149.00', priceCurrency: 'USD', availability: 'https://schema.org/InStock', url: '/checkout/field-kit' },
            { '@type': 'Offer', name: 'Team', price: '249.00', priceCurrency: 'USD', availability: 'https://schema.org/LimitedAvailability', url: '/checkout/field-kit-team' },
          ],
        },
        {
          '@type': 'Service',
          name: 'On-site Setup',
          description: 'A two hour setup service for local teams.',
          duration: 'PT2H',
          areaServed: 'Dallas, Texas',
          offers: { '@type': 'Offer', price: '300', priceCurrency: 'USD', url: '/book/setup' },
        },
        {
          '@type': 'LocalBusiness',
          name: 'Field House',
          email: 'hello@fieldhouse.example',
          telephone: '+1 214 555 0199',
          address: {
            '@type': 'PostalAddress',
            streetAddress: '100 Main Street',
            addressLocality: 'Dallas',
            addressRegion: 'TX',
            postalCode: '75201',
            addressCountry: 'US',
          },
          openingHours: ['Mo-Fr 09:00-17:00'],
        },
        {
          '@type': 'FAQPage',
          mainEntity: [{
            '@type': 'Question',
            name: 'Do you provide setup?',
            acceptedAnswer: { '@type': 'Answer', text: 'Yes, setup is available in Dallas.' },
          }],
        },
      ],
    }
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const requested = String(input)
      if (/robots\.txt|sitemap\.xml|wp-sitemap\.xml|llms\.txt|agent\.json|nexez\.json/i.test(requested)) {
        return new Response('', { status: 404 })
      }
      const body = requested === 'https://rich-evidence-v2.example.com/'
        ? `<script type="application/ld+json">${JSON.stringify(graph)}</script><a href="/book/setup">Book setup</a>`
        : `<p>${requested}</p>`
      return new Response(`<!doctype html><html><head><title>Field House</title><meta name="description" content="Products and setup for field teams."></head><body>${body}</body></html>`, { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await analyzeSite('https://rich-evidence-v2.example.com/', null, { skipLlm: true })
    const product = result.structuredOffers.find((offer) => offer.name === 'Field Operations Kit')
    const service = result.structuredOffers.find((offer) => offer.name === 'On-site Setup')

    expect(product).toMatchObject({
      price: 'USD 149.00',
      availability: 'available',
      metadata: expect.objectContaining({ offerKind: 'product', currency: 'USD' }),
    })
    expect(product?.tiers).toEqual([
      { name: 'Standard', price: 'USD 149.00' },
      { name: 'Team', price: 'USD 249.00' },
    ])
    expect(service).toMatchObject({
      price: 'USD 300',
      duration: 'PT2H',
      serviceArea: 'Dallas, Texas',
      metadata: expect.objectContaining({ offerKind: 'service' }),
    })
    expect(result.businessDetails).toMatchObject({
      email: 'hello@fieldhouse.example',
      phone: '+1 214 555 0199',
      address: '100 Main Street, Dallas, TX, 75201, US',
      openingHours: ['Mo-Fr 09:00-17:00'],
    })
    expect(result.location).toBe('100 Main Street, Dallas, TX, 75201, US')
    expect(result.cta_url).toBe('https://rich-evidence-v2.example.com/book/setup')
    expect(result.faqs).toEqual(expect.arrayContaining([
      { question: 'Do you provide setup?', answer: 'Yes, setup is available in Dallas.' },
    ]))
    expect(result.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'contact.email', value: 'hello@fieldhouse.example', status: 'detected' }),
      expect.objectContaining({ field: expect.stringMatching(/offers\.\d+\.kind/), value: 'product', status: 'detected' }),
      expect.objectContaining({ field: 'faq', status: 'detected' }),
    ]))
    expect(product?.metadata?.evidenceIds?.length).toBeGreaterThan(3)
  })

  it('groups visible offer cards and records contact and action evidence', async () => {
    const homepage = `<!doctype html><html><head><title>Card Studio</title></head><body>
      <section class="service-card">
        <h2>Home Energy Audit</h2>
        <p>A 90 minute home assessment with a written action plan for $225.</p>
        <a href="/book/energy-audit">Schedule audit</a>
      </section>
      <address>42 Oak Avenue, Austin, TX 78701</address>
      <a href="mailto:hello@cardstudio.example">Email our team</a>
      <a href="tel:+15125550110">Call our team</a>
    </body></html>`
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const requested = String(input)
      if (/robots\.txt|sitemap\.xml|wp-sitemap\.xml|llms\.txt|agent\.json|nexez\.json/i.test(requested)) {
        return new Response('', { status: 404 })
      }
      return new Response(requested === 'https://card-evidence-v2.example.com/' ? homepage : `<!doctype html><html><head><title>Card Studio</title></head><body><p>${requested}</p></body></html>`, { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await analyzeSite('https://card-evidence-v2.example.com/', null, { skipLlm: true })
    const offer = result.structuredOffers.find((item) => item.name === 'Home Energy Audit')

    expect(offer).toMatchObject({
      price: '$225',
      duration: '90 minute',
      url: 'https://card-evidence-v2.example.com/book/energy-audit',
      metadata: expect.objectContaining({ offerKind: 'service' }),
    })
    expect(result.businessDetails).toMatchObject({
      email: 'hello@cardstudio.example',
      phone: '+15125550110',
      address: '42 Oak Avenue, Austin, TX 78701',
    })
    expect(result.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'contact.email', sourceText: 'hello@cardstudio.example' }),
      expect.objectContaining({ field: 'action.book', value: 'https://card-evidence-v2.example.com/book/energy-audit' }),
    ]))
  })

  it('pairs plan titles with nearby prices and ranks a trial above support links', async () => {
    const homepage = `<!doctype html><html><head><title>Schedule Cloud Pricing</title><meta name="description" content="Appointment scheduling software."></head><body>
      <a href="/support">Contact support</a>
      <div class="pricing-plan">
        <div class="phase2-plan-title">Starter</div>
        <div><span class="price-amount">$16</span><span>/ month</span></div>
        <a href="/get-started?plan=starter">Start free trial</a>
      </div>
      <div class="pricing-plan">
        <div class="phase2-plan-title">Premium</div>
        <div><span class="price-amount">$49</span><span>/ month</span></div>
        <a href="/get-started?plan=premium">Start free trial</a>
      </div>
    </body></html>`
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const requested = String(input)
      if (/robots\.txt|sitemap\.xml|wp-sitemap\.xml|llms\.txt|agent\.json|nexez\.json/i.test(requested)) {
        return new Response('', { status: 404 })
      }
      return new Response(homepage, { status: 200, headers: { 'content-type': 'text/html' } })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await analyzeSite('https://schedule-cloud-v2.example.com/pricing', null, { skipLlm: true })

    expect(result.structuredOffers).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Starter', price: '$16', metadata: expect.objectContaining({ offerKind: 'product' }) }),
      expect.objectContaining({ name: 'Premium', price: '$49', metadata: expect.objectContaining({ offerKind: 'product' }) }),
    ]))
    expect(result.cta_url).toContain('/get-started')
    expect(result.cta_label).toMatch(/start free trial/i)
  })

  it('lets structured services dominate noisy booking and editorial headings', async () => {
    const services = [
      { '@type': 'Service', name: 'One-time Premium Cleaning', url: '/premium-cleaning' },
      { '@type': 'Service', name: 'Move-in and Move-out Cleaning', url: '/moving-cleaning' },
      { '@type': 'Service', name: 'Routine Cleaning', url: '/routine-cleaning' },
      { '@type': 'Service', name: 'Deep Cleaning', url: '/deep-cleaning' },
    ]
    const homepage = `<!doctype html><html><head>
      <title>Kismet Quality Fixture</title>
      <meta property="og:image" content="/img/modern-hero.jpg">
      <script type="application/ld+json">${JSON.stringify({
        '@context': 'https://schema.org',
        '@graph': [
          { '@type': 'Organization', name: 'Kismet Quality Fixture', logo: '/assets/kismet-logo.svg' },
          ...services,
        ],
      })}</script>
      </head><body>
        <header><img src="/assets/kismet-logo.svg" alt="Kismet Quality Fixture logo"></header>
        <h2>FORT WORTH</h2>
        <h2>Step 1 - Enter Your Address</h2>
        <h2>Step 4 - Select a Date and Time</h2>
        <h2>Step 5 - Review and Securely Book</h2>
        <h2>Trusted by 1 + Dallas Families and Growing.</h2>
        <article><h2>1. The Type of Cleaning Service</h2><p>Routine cleaning is one factor that affects your quote.</p></article>
        <a href="/book">Book now</a>
      </body></html>`
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const requested = String(input)
      if (/robots\.txt|sitemap\.xml|wp-sitemap\.xml|llms\.txt|agent\.json|nexez\.json/i.test(requested)) return new Response('', { status: 404 })
      if (requested === 'https://kismet-quality-v2.example.com/') return new Response(homepage, { status: 200 })
      return new Response('<!doctype html><html><head><title>Kismet Quality Fixture</title></head><body><p>Company information.</p></body></html>', { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await analyzeSite('https://kismet-quality-v2.example.com/', null, { skipLlm: true })

    expect(result.structuredOffers.map((offer) => offer.name).sort()).toEqual([
      'Deep Cleaning',
      'Move-in and Move-out Cleaning',
      'One-time Premium Cleaning',
      'Routine Cleaning',
    ])
    expect(result.logo_url).toBe('https://kismet-quality-v2.example.com/assets/kismet-logo.svg')
    expect(result.readiness?.strengths).toContain('4 high-confidence offers verified.')
  })

  it('keeps repeated plan cards atomic and includes destination in their identity', async () => {
    const plan = (destination: string, slug: string) => `
      <article class="card plan-card">
        <div class="plan-card-header">
          <p class="destination-name">${destination}</p>
          <h3>5 GB</h3>
        </div>
        <div class="plan-card-benefits"><span>30 days</span><span>Instant eSIM</span><span>Hotspot</span></div>
        <div class="plan-card-footer"><span>One-time price</span><strong>$5.49</strong>
          <a href="/plans/${slug}-5-gb-30-days">View plan</a>
        </div>
      </article>`
    const homepage = `<!doctype html><html><head><title>Travel eSIM Plans</title><meta name="description" content="Travel eSIM data plans."></head><body>
      ${plan('Spain', 'spain')}
      ${plan('United States', 'united-states')}
      ${plan('United Kingdom', 'united-kingdom')}
      ${plan('France', 'germany')}
      <article class="card plan-card"><h3>Supported networks</h3><span>30 days</span><span>$5.49</span><a href="/plans/france-5-gb-30-days">View plan</a></article>
      <section><h3>30 days 3G/4G/5G Instant eSIM Hotspot One-time price View plan Spain</h3><p>$20.49</p><a href="/plans/united-arab-emirates-10-gb-30-days">View plan</a></section>
    </body></html>`
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const requested = String(input)
      if (/robots\.txt|sitemap\.xml|wp-sitemap\.xml|llms\.txt|agent\.json|nexez\.json/i.test(requested)) return new Response('', { status: 404 })
      return new Response(homepage, { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await analyzeSite('https://wirect-quality-v2.example.com/', null, { skipLlm: true })

    expect(result.structuredOffers).toHaveLength(3)
    expect(result.structuredOffers).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Spain 5 GB', url: 'https://wirect-quality-v2.example.com/plans/spain-5-gb-30-days', price: '$5.49', duration: '30 day' }),
      expect.objectContaining({ name: 'United States 5 GB', url: 'https://wirect-quality-v2.example.com/plans/united-states-5-gb-30-days', price: '$5.49' }),
      expect.objectContaining({ name: 'United Kingdom 5 GB', url: 'https://wirect-quality-v2.example.com/plans/united-kingdom-5-gb-30-days', price: '$5.49' }),
    ]))
    expect(result.structuredOffers.every((offer) => offer.metadata?.offerKind === 'product')).toBe(true)
    expect(result.structuredOffers.some((offer) => /one-time price|30 days 3g/i.test(offer.name))).toBe(false)
    expect(new Set(result.structuredOffers.map((offer) => offer.url)).size).toBe(3)
  })

  it('keeps domain vocabulary and documentation links out of CTA intent', async () => {
    const homepage = `<!doctype html><html><head><title>Booking Plugin</title></head><body>
      <h1>Appointment booking plugin</h1>
      <h2>Service area and send the right team out</h2>
      <a href="/documents/quick-start-guide">Getting Started with the Appointment Booking Plugin</a>
      <a href="/checkout/?edd_action=add_to_cart&amp;download_id=42">Buy Standard</a>
    </body></html>`
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const requested = String(input)
      if (/robots\.txt|sitemap\.xml|wp-sitemap\.xml|llms\.txt|agent\.json|nexez\.json/i.test(requested)) {
        return new Response('', { status: 404 })
      }
      return new Response(homepage, { status: 200, headers: { 'content-type': 'text/html' } })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await analyzeSite('https://booking-plugin-v2.example.com/', null, { skipLlm: true })

    expect(result.cta_label).toBe('Buy Standard')
    expect(result.cta_url).toBe('https://booking-plugin-v2.example.com/checkout/?edd_action=add_to_cart&download_id=42')
    expect(result.location).toBeNull()
  })
})
