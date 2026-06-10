import { describe, expect, it, vi, beforeEach, afterAll } from 'vitest'
import type { QueryContext } from '../../test/supabase-mock'
import { createLLMAdapter, getActiveLLMProvider } from '../llm-engine'
import { NegotiationService, ConversationTurn } from '../negotiation.service'

// Route the service's module-singleton supabase through a per-test-mutable handler
// so the real createNewNegotiation/loadNegotiation persistence paths can be tested.
const { dbRef } = vi.hoisted(() => ({
  dbRef: { handler: (_ctx: any) => ({ data: null, error: null }) as { data?: any; error?: any } },
}))

vi.mock('../supabase', async () => {
  const { createSupabaseMock } = await import('../../test/supabase-mock')
  return { supabase: createSupabaseMock((ctx) => dbRef.handler(ctx)) }
})

// Mock the platform LLM env for tests
const originalEnv = process.env

beforeEach(() => {
  vi.resetModules()
  process.env = { ...originalEnv }
})

afterAll(() => {
  process.env = originalEnv
})

describe('LLMClientFactory (respects platform LLM config)', () => {
  it('infers grok when base url is x.ai and no explicit PROVIDER', () => {
    process.env.LLM_PROVIDER = ''
    process.env.LLM_BASE_URL = 'https://api.x.ai/v1'
    process.env.LLM_API_KEY = 'test-key'
    const adapter = createLLMAdapter()
    expect(adapter.provider).toBe('grok')
    expect(getActiveLLMProvider()).toBe('grok')
  })

  it('infers gemini from generativelanguage base', () => {
    process.env.LLM_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/'
    process.env.LLM_API_KEY = 'test'
    const adapter = createLLMAdapter()
    expect(adapter.provider).toBe('gemini')
  })

  it('defaults to openai when no hints', () => {
    process.env.LLM_BASE_URL = 'https://api.openai.com/v1'
    process.env.LLM_API_KEY = 'test'
    const adapter = createLLMAdapter()
    expect(adapter.provider).toBe('openai')
  })

  it('respects explicit LLM_PROVIDER over inference', () => {
    process.env.LLM_PROVIDER = 'claude'
    process.env.LLM_BASE_URL = 'https://api.x.ai/v1'
    process.env.LLM_API_KEY = 'test'
    const adapter = createLLMAdapter()
    expect(adapter.provider).toBe('claude')
  })
})

describe('NegotiationService (with dedicated messages table)', () => {
  it('builds persistent link with status token when present', async () => {
    // Mock supabase and llm
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'neg-123', status_token: 'tok-abc', slug: 'test-page', owner_id: 'owner1', metadata: {} }, error: null }),
      insert: vi.fn().mockResolvedValue({ error: null }),
      update: vi.fn().mockResolvedValue({ error: null }),
      order: vi.fn().mockReturnThis(),
    }

    // We test the link generation logic indirectly via a minimal service instance
    // (full integration would require more mocks for loadPublishedPage etc.)
    const mockLLM = { negotiate: vi.fn().mockResolvedValue({ action: 'counter', reasoning: 'test' }) }
    const service = new NegotiationService(mockLLM)
    service['loadPublishedPage'] = vi.fn().mockResolvedValue({ 
      id: 'page1', 
      slug: 'test', 
      owner_id: 'o1', 
      services: [{ name: 'Test Offer', price: '$100', offerType: 'negotiable', rules: {} }], 
      products: [] 
    })
    service['loadNegotiation'] = vi.fn().mockResolvedValue(null)
    service['createNewNegotiation'] = vi.fn().mockResolvedValue({ id: 'neg-123', status_token: 'tok-abc', slug: 'test' })
    service['loadHistory'] = vi.fn().mockResolvedValue([])
    service['persistHistoryAndStatus'] = vi.fn().mockResolvedValue(undefined)

    const result = await service.startOrContinue({
      slug: 'test',
      offerKey: 'services-0',
      buyerProposal: { proposedPriceCents: 50000 },
    })

    expect(result.persistentLink).toContain('/negotiate/neg-123')
    expect(result.persistentLink).toContain('?token=tok-abc')
    // The token the service returns must be the persisted one — the route surfaces
    // it as statusToken/statusUrl for agent status polling.
    expect(result.statusToken).toBe('tok-abc')
    expect(result.history.length).toBeGreaterThan(0)
  })

  it('persists the same status token it returns (fresh creation, real insert path)', async () => {
    const page = {
      id: 'p1',
      owner_id: 'o1',
      slug: 'demo',
      services: [{ name: 'Consult', price: '$100', description: '', url: '' }],
      products: [],
    }
    let insertedNegotiation: any
    dbRef.handler = (ctx: QueryContext) => {
      if (ctx.table === 'pages') return { data: page, error: null }
      if (ctx.table === 'agent_negotiations' && ctx.op === 'insert') {
        insertedNegotiation = ctx.payload
        return { error: null }
      }
      return { data: [], error: null }
    }

    const mockLLM = { negotiate: vi.fn().mockResolvedValue({ action: 'counter', reasoning: 'r' }) }
    const service = new NegotiationService(mockLLM)
    const result = await service.startOrContinue({
      slug: 'demo',
      offerKey: 'services-0',
      buyerProposal: { proposedPriceCents: 9000 },
    })

    // Regression guard for the prod bug where the route returned a token that was
    // never written to the row → every status poll 404'd.
    expect(insertedNegotiation?.status_token).toBeTruthy()
    expect(result.statusToken).toBe(insertedNegotiation.status_token)
    expect(result.persistentLink).toContain(`token=${insertedNegotiation.status_token}`)
  })

  it('continuation requires the stored token: 404 on mismatch, resumes + returns it on match', async () => {
    const page = {
      id: 'p1',
      owner_id: 'o1',
      slug: 'demo',
      services: [{ name: 'Consult', price: '$100', description: '', url: '' }],
      products: [],
    }
    const row = { id: 'neg-9', status: 'negotiation', status_token: 'real-tok', slug: 'demo', metadata: {} }
    dbRef.handler = (ctx: QueryContext) => {
      if (ctx.table === 'pages') return { data: page, error: null }
      if (ctx.table === 'agent_negotiations' && ctx.op === 'select') return { data: row, error: null }
      return { data: [], error: null }
    }

    const mockLLM = { negotiate: vi.fn().mockResolvedValue({ action: 'counter', reasoning: 'r' }) }
    const service = new NegotiationService(mockLLM)

    await expect(
      service.startOrContinue({
        slug: 'demo',
        offerKey: 'services-0',
        buyerProposal: { proposedPriceCents: 9000 },
        negotiationId: 'neg-9',
        statusToken: 'wrong-token',
      }),
    ).rejects.toMatchObject({ status: 404 })

    const result = await service.startOrContinue({
      slug: 'demo',
      offerKey: 'services-0',
      buyerProposal: { proposedPriceCents: 9000 },
      negotiationId: 'neg-9',
      statusToken: 'real-tok',
    })
    expect(result.negotiationId).toBe('neg-9')
    expect(result.statusToken).toBe('real-tok')
  })

  it('appends buyer and seller turns to history', async () => {
    const mockLLM = { negotiate: vi.fn().mockResolvedValue({ action: 'accept', reasoning: 'ok' }) }
    const service = new NegotiationService(mockLLM)
    service['loadPublishedPage'] = vi.fn().mockResolvedValue({ 
      id: 'p1', 
      slug: 's', 
      owner_id: 'o', 
      services: [{ name: 'Test', price: '$100', offerType: 'negotiable', rules: { minPrice: '100' } }], 
      products: [] 
    })
    service['loadNegotiation'] = vi.fn().mockResolvedValue({ id: 'n1', status: 'negotiation', status_token: 't1' })
    service['loadHistory'] = vi.fn().mockResolvedValue([])
    service['persistHistoryAndStatus'] = vi.fn().mockResolvedValue(undefined)

    const result = await service.startOrContinue({
      slug: 's',
      offerKey: 'svc-0',
      buyerProposal: { proposedPriceCents: 15000 },
      negotiationId: 'n1',
    })

    expect(result.history.length).toBe(2)
    expect(result.history[0].role).toBe('buyer')
    expect(result.history[1].role).toBe('seller_llm')
    expect(result.history[1].decision?.action).toBe('accept')
  })
})

// Basic adapter interface test (function calling contract)
describe('LLM Adapters (function calling contract)', () => {
  it('all adapters expose negotiate with history param', () => {
    const providers = ['gemini', 'grok', 'claude', 'openai']
    providers.forEach(p => {
      process.env.LLM_PROVIDER = p
      process.env.LLM_API_KEY = 'dummy'
      const adapter = createLLMAdapter()
      expect(typeof adapter.negotiate).toBe('function')
      // Quick signature check via call (will fail auth but proves interface)
      expect(adapter.negotiate.length).toBe(3) // rules, proposal, history
    })
  })
})
