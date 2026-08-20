import { beforeEach, describe, expect, it, vi } from 'vitest'

const { dbRef, llmRef } = vi.hoisted(() => ({
  dbRef: { handler: (_c: any) => ({ data: [] as any[], error: null }) as { data?: any; error?: any } },
  llmRef: {
    configured: false,
    response: null as string | null,
    lastPrompt: null as string | null,
    lastOptions: null as Record<string, unknown> | null,
  },
}))

vi.mock('../../../lib/supabase', async () => {
  const { createSupabaseMock } = await import('../../../test/supabase-mock')
  return { supabase: createSupabaseMock((c) => dbRef.handler(c)) }
})
vi.mock('../../../lib/rate-limit', () => ({
  enforceRateLimit: vi.fn(async () => null),
}))
vi.mock('../../../lib/llm', () => ({
  isLlmConfigured: vi.fn(() => llmRef.configured),
  llmComplete: vi.fn(async (prompt: string, options: Record<string, unknown>) => {
    llmRef.lastPrompt = prompt
    llmRef.lastOptions = options
    return llmRef.response
  }),
}))

import { POST } from './route'

const post = (body: unknown) =>
  new Request('https://nexez.test/api/public-simulate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

const badJsonPost = () =>
  new Request('https://nexez.test/api/public-simulate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{',
  })

const consultingPage = {
  name: 'Strategy Studio',
  slug: 'strategy-studio',
  description: 'Strategy consulting for startup founders.',
  industry: 'Management Consulting',
  location: 'Remote',
  products: [],
  services: [{ name: 'Strategy Session', price: '$250', description: 'A strategy consultation.', url: '' }],
  faqs: [],
  is_published: true,
  marketplace_discoverable: true,
  created_at: '2026-01-01T00:00:00Z',
}

const kismetPage = {
  name: 'Kismet Pros',
  slug: 'kismetpros',
  description: 'Residential cleaning services across the Dallas-Fort Worth Metroplex.',
  industry: 'Residential Cleaning Services',
  location: 'Dallas-Fort Worth Metroplex, Texas',
  website_url: 'https://kismetpros.com',
  products: [],
  services: [
    {
      name: 'Routine Cleaning',
      price: 'Custom quote',
      description: 'Weekly or bi-weekly home cleaning.',
      url: 'https://kismetpros.com/book/',
      prefer_original_for_this: true,
    },
    {
      name: 'Moving Cleaning',
      price: 'Custom quote',
      description: 'Thorough move-in or move-out cleaning designed to reduce the workload around a move.',
      url: 'https://kismetpros.com/book/',
      prefer_original_for_this: true,
    },
  ],
  faqs: [],
  is_published: true,
  marketplace_discoverable: true,
  created_at: '2026-01-02T00:00:00Z',
}

describe('POST /api/public-simulate', () => {
  beforeEach(() => {
    llmRef.configured = false
    llmRef.response = null
    llmRef.lastPrompt = null
    llmRef.lastOptions = null
    dbRef.handler = (ctx: any) =>
      ctx.table === 'pages_public'
        ? { data: [kismetPage, consultingPage], error: null }
        : { data: null, error: null }
  })

  it('400 when the query is missing or blank', async () => {
    expect((await POST(post({}))).status).toBe(400)
    expect((await POST(post({ query: '   ' }))).status).toBe(400)
  })

  it('400 for malformed JSON', async () => {
    expect((await POST(badJsonPost())).status).toBe(400)
  })

  it('finds a real marketplace merchant instead of the legacy Nexez Agency demo', async () => {
    const res = await POST(post({
      query: 'find me a cleaning service that can handle a 2x2 move out cleaning for next wednesday',
    }))
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.mode).toBe('marketplace')
    expect(body.noMatch).toBe(false)
    expect(body.matchedBusiness).toMatchObject({
      name: 'Kismet Pros',
      slug: 'kismetpros',
      offer: { name: 'Moving Cleaning', price: 'Custom quote' },
    })
    expect(body.simulation).toBeNull()
    expect(body.naturalLanguage).toContain('Kismet Pros')
    expect(body.naturalLanguage).not.toContain('Nexez Agency')
    expect(body.naturalLanguage).toContain('validate')
    expect(body.agentActions.join(' ')).toContain('live marketplace search')
  })

  it('falls back to a clearly labelled Commerce Library simulation when live supply does not match', async () => {
    dbRef.handler = (ctx: any) =>
      ctx.table === 'pages_public'
        ? { data: [consultingPage], error: null }
        : { data: null, error: null }

    const res = await POST(post({ query: 'I need a move out cleaning for next Wednesday' }))
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.mode).toBe('simulation')
    expect(body.noMatch).toBe(true)
    expect(body.matchedBusiness).toBeNull()
    expect(body.offers).toEqual([])
    expect(body.simulation).toMatchObject({
      active: true,
      source: 'commerce-library',
      candidate: {
        id: 'home.move-out-cleaning',
        title: 'Move-Out Cleaning',
      },
    })
    expect(body.simulation.label).toContain('SIMULATION')
    expect(body.naturalLanguage).toContain('I couldn’t find a live Nexez provider')
    expect(body.naturalLanguage).toContain('Move-Out Cleaning')
    expect(body.naturalLanguage).toContain('cannot be booked')
    expect(body.naturalLanguage).not.toMatch(/capabilityTags|gapSignals|matchedTerms|matchScore|\*\*/)
    expect(body.schema.simulation).toBe(true)
  })

  it('rejects technical or Markdown-heavy LLM output and uses composed buyer guidance', async () => {
    llmRef.configured = true
    llmRef.response = '**Nexez models the buyer request via the provisional "events.private-chef" reference scenario.** The archetype and capabilityTags include QUOTE_REQUIRED, MOBILE, SERVICE_AREA, UNIT_PRICING, CAPACITY_LIMITED, CUSTOM_INTAKE, and DEPOSIT. The matchedTerms produce a matchScore of 7.'
    dbRef.handler = (ctx: any) =>
      ctx.table === 'pages_public'
        ? { data: [consultingPage], error: null }
        : { data: null, error: null }

    const res = await POST(post({ query: 'Find a mobile chef for this weekend' }))
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.mode).toBe('simulation')
    expect(body.simulation.candidate.title).toBe('Private Chef')
    expect(body.llmEnhanced).toBe(false)
    expect(body.naturalLanguage).toContain('I couldn’t find a live Nexez provider')
    expect(body.naturalLanguage).toContain('preferred date and time')
    expect(body.naturalLanguage).toContain('guest count')
    expect(body.naturalLanguage).toContain('dietary needs')
    expect(body.naturalLanguage).toContain('budget')
    expect(body.naturalLanguage).not.toMatch(/\*\*|events\.private-chef|archetype|capabilityTags|matchedTerms|matchScore|QUOTE_REQUIRED/)
    expect(llmRef.lastPrompt).not.toMatch(/capabilityTags|gapSignals|matchedTerms|matchScore|events\.private-chef/)
    expect(llmRef.lastOptions?.system).toContain('buyer-facing answer')
  })

  it('accepts a concise plain-text LLM answer that preserves the no-live-provider boundary', async () => {
    llmRef.configured = true
    llmRef.response = 'I couldn’t find a live Nexez provider for this request. A real private-chef match would need your preferred date, location, guest count, menu preferences, and dietary needs before price or availability could be checked.'
    dbRef.handler = (ctx: any) =>
      ctx.table === 'pages_public'
        ? { data: [consultingPage], error: null }
        : { data: null, error: null }

    const res = await POST(post({ query: 'Find a mobile chef for this weekend' }))
    const body = await res.json()

    expect(body.mode).toBe('simulation')
    expect(body.llmEnhanced).toBe(true)
    expect(body.naturalLanguage).toBe(llmRef.response)
  })

  it('returns a truthful no-match instead of inventing a merchant or unrelated library scenario', async () => {
    dbRef.handler = (ctx: any) =>
      ctx.table === 'pages_public'
        ? { data: [consultingPage], error: null }
        : { data: null, error: null }

    const res = await POST(post({ query: 'xylophone quantum reactor calibration' }))
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.mode).toBe('no_match')
    expect(body.noMatch).toBe(true)
    expect(body.matchedBusiness).toBeNull()
    expect(body.simulation).toBeNull()
    expect(body.naturalLanguage).toContain('will not invent a provider')
  })

  it('503 when live marketplace discovery is unavailable', async () => {
    dbRef.handler = (ctx: any) =>
      ctx.table === 'pages_public'
        ? { data: null, error: { message: 'database unavailable' } }
        : { data: null, error: null }

    const res = await POST(post({ query: 'find a cleaning service' }))
    expect(res.status).toBe(503)
    expect((await res.json()).error).toContain('Marketplace search is temporarily unavailable')
  })
})
