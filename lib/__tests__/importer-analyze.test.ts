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
          question: 'Who should AI agents recommend this page to first?',
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
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/chat/completions')) {
        return new Response(JSON.stringify({
          choices: [{
            message: {
              content: JSON.stringify({
                title: 'AI Strategy Studio',
                description: 'AI-ready strategy services for operators.',
                audience: 'service operators',
                industry: 'Consulting & Strategy',
                cta_label: 'Book consultation',
                cta_url: 'https://ai.example.com/book',
                offers: [{
                  name: 'AI Offer Audit',
                  price: '$500',
                  description: 'A focused audit of agent-readable offers and booking paths.',
                  url: 'https://ai.example.com/audit',
                  confidence: 0.91,
                  sourceUrl: 'https://ai.example.com/services',
                  sourceLabel: 'AI services page',
                }],
                faqs: [{ question: 'Can agents book this?', answer: 'Yes, use the booking link.' }],
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

    expect(result.title).toBe('AI Strategy Studio')
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
    expect(result.structuredOffers.some((offer) => offer.name === 'AI Offer Audit')).toBe(true)
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

  it('never serves an entitled AI import from cache to a deterministic-only caller', async () => {
    process.env.LLM_API_KEY = 'sk-test'
    process.env.LLM_BASE_URL = 'https://llm.example.com/v1'
    let llmCalls = 0
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/chat/completions')) {
        llmCalls += 1
        return new Response(JSON.stringify({
          choices: [{
            message: {
              content: JSON.stringify({
                title: 'Paid AI Draft',
                offers: [{ name: 'AI-only offer', price: '$500', description: 'AI extracted.', url: '' }],
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

    expect(aiResult.title).toBe('Paid AI Draft')
    expect(deterministicResult.title).toBe('Example Strategy Studio')
    expect(deterministicResult.aiStatus).toMatchObject({ attempted: false, used: false, status: 'deterministic' })
    expect(llmCalls).toBe(1)
  })
})
