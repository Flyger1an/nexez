import { describe, it, expect } from 'vitest'
import {
  detectIntent,
  interpretPublicQuery,
  getDemoPage,
  agentVerdict,
  gradeAgentSuccess,
  runMultiAgentSimulation,
} from '../agent-simulator'
import type { AgentPage } from '../agent-page'

const page = getDemoPage()

const AGENTS = ['ChatGPT', 'Claude', 'Grok', 'Perplexity', 'Generic Agent'] as const

// A deliberately thin page: one offer, no price, no audience/faqs/contact/site.
const sparsePage: AgentPage = {
  id: 'sparse',
  owner_id: null,
  name: 'Bare Co',
  slug: 'bare-co',
  description: null,
  website_url: null,
  cta_url: null,
  cta_label: null,
  audience: null,
  location: null,
  contact_email: null,
  prefer_original_site: false,
  is_published: false,
  products: null,
  services: [{ name: 'Mystery Service', description: '', price: '', url: '' }],
  faqs: null,
  created_at: new Date().toISOString(),
}

// A page with zero offers - agents have nothing to act on.
const emptyPage: AgentPage = { ...sparsePage, id: 'empty', slug: 'empty', services: null, products: null }

describe('agent-simulator: query-aware public simulation', () => {
  it('detects intent across distinct buyer questions', () => {
    expect(detectIntent('Can an agent book a session next week?')).toBe('booking')
    expect(detectIntent('how much does this cost?')).toBe('pricing')
    expect(detectIntent('what products can I buy?')).toBe('product')
    expect(detectIntent('how do I contact you')).toBe('contact')
    expect(detectIntent('is this a good fit for a scaling startup')).toBe('fit')
    expect(detectIntent('tell me about this business')).toBe('overview')
  })

  it('produces DIFFERENT answers for different queries (not a constant response)', () => {
    const booking = interpretPublicQuery(page, 'Can an agent book a 60-minute session next week?')
    const pricing = interpretPublicQuery(page, 'How much does strategy work cost here?')

    expect(booking.intent).toBe('booking')
    expect(pricing.intent).toBe('pricing')
    expect(booking.answer).not.toBe(pricing.answer)
    expect(booking.agentActions).not.toEqual(pricing.agentActions)
  })

  it('echoes the visitor query into the tailored answer', () => {
    const r = interpretPublicQuery(page, 'book a strategy session')
    expect(r.answer).toContain('book a strategy session')
  })

  it('flags exactly one best-match offer and includes its checkout key in the actions', () => {
    const r = interpretPublicQuery(page, 'leadership coaching package')
    const best = r.offers.filter((o) => o.bestMatch)
    expect(best).toHaveLength(1)
    // token overlap on "leadership coaching" should pick that service
    expect(best[0].name.toLowerCase()).toContain('coaching')
    expect(r.agentActions.some((a) => a.includes(`offer: "${best[0].key}"`))).toBe(true)
  })

  it('ranks the matched offer first and reports readiness + confidence', () => {
    const r = interpretPublicQuery(page, 'what products can I buy right now?')
    expect(r.offers[0].bestMatch).toBe(true)
    expect(r.offers[0].type).toBe('product')
    expect(r.readiness).toBeGreaterThan(0)
    expect(r.confidence).toBeGreaterThan(0)
  })
})

describe('agent-simulator: differentiated agent verdicts', () => {
  it('every persona returns a distinct lens', () => {
    const lenses = AGENTS.map((a) => agentVerdict(page, 'book a session', a).lens)
    expect(new Set(lenses).size).toBe(AGENTS.length)
  })

  it('reaches DIFFERENT stances on the same thin page (the whole point)', () => {
    // Sparse page: one offer, no price, unpublished. Personas should diverge.
    const verdicts = AGENTS.map((a) => agentVerdict(sparsePage, 'how much is it?', a))
    const stances = new Set(verdicts.map((v) => v.stance))
    expect(stances.size).toBeGreaterThan(1)
    // ChatGPT can still reach checkout (action exists) but pauses on missing price.
    expect(agentVerdict(sparsePage, 'book it', 'ChatGPT').stance).toBe('needs_info')
    // Grok skips an unpriced page.
    expect(agentVerdict(sparsePage, 'how much?', 'Grok').stance).toBe('skip')
    // Perplexity won't cite an unpublished page.
    expect(agentVerdict(sparsePage, 'who is this', 'Perplexity').stance).toBe('skip')
  })

  it('all personas skip / flag a page with zero offers', () => {
    expect(agentVerdict(emptyPage, 'anything', 'ChatGPT').stance).toBe('skip')
    expect(agentVerdict(emptyPage, 'anything', 'Grok').stance).toBe('skip')
    // Generic agent: schema validates but is empty → needs_info, not recommend.
    expect(agentVerdict(emptyPage, 'anything', 'Generic Agent').stance).toBe('needs_info')
  })

  it('recommends a well-built page across action / price / source lenses', () => {
    expect(agentVerdict(page, 'book a strategy session', 'ChatGPT').stance).toBe('recommend')
    expect(agentVerdict(page, 'how much', 'Grok').stance).toBe('recommend')
    expect(agentVerdict(page, 'tell me about this', 'Perplexity').stance).toBe('recommend')
  })

  it('Grok names a concrete gap when not every offer is priced', () => {
    const mixed: AgentPage = {
      ...page,
      services: [
        { name: 'Priced', description: 'x', price: '$100', url: '' },
        { name: 'Unpriced', description: 'y', price: '', url: '' },
      ],
      products: null,
    }
    const v = agentVerdict(mixed, 'pricing', 'Grok')
    expect(v.stance).toBe('needs_info')
    expect(v.gaps.join(' ')).toMatch(/price/i)
  })

  it('unknown agent names fall back to the schema persona', () => {
    expect(agentVerdict(page, 'x', 'SomeNewBot').lens).toBe(agentVerdict(page, 'x', 'Generic Agent').lens)
  })
})

describe('agent-simulator: agent success score', () => {
  it('scores a complete page high and a thin page low', () => {
    const good = gradeAgentSuccess(page, 'book a session')
    const bad = gradeAgentSuccess(sparsePage, 'book a session')
    expect(good.score).toBeGreaterThan(bad.score)
    expect(good.verdict).toBe('ready')
    expect(bad.verdict).not.toBe('ready')
  })

  it('blocks a page with no offers regardless of other fields', () => {
    const r = gradeAgentSuccess(emptyPage, 'anything')
    expect(r.verdict).toBe('blocked')
    expect(r.checks.find((c) => c.key === 'offer')?.pass).toBe(false)
  })

  it('every failing check carries an actionable fix + a field hint; passing checks do not', () => {
    const r = gradeAgentSuccess(sparsePage, 'how much?')
    for (const c of r.checks) {
      if (c.pass) expect(c.fix).toBeNull()
      else {
        expect(c.fix).toBeTruthy()
        expect(c.field).toBeTruthy()
      }
    }
  })

  it('weights sum to 100 and score is 0–100', () => {
    const r = gradeAgentSuccess(page, 'x')
    expect(r.checks.reduce((s, c) => s + c.weight, 0)).toBe(100)
    expect(r.score).toBeGreaterThanOrEqual(0)
    expect(r.score).toBeLessThanOrEqual(100)
  })

  it('marks checks relevant to the detected intent', () => {
    const pricing = gradeAgentSuccess(page, 'how much does it cost?')
    expect(pricing.intent).toBe('pricing')
    expect(pricing.checks.find((c) => c.key === 'price')?.relevant).toBe(true)
    const fit = gradeAgentSuccess(page, 'is this right for a scaling startup?')
    expect(fit.intent).toBe('fit')
    expect(fit.checks.find((c) => c.key === 'audience')?.relevant).toBe(true)
  })
})

describe('agent-simulator: runMultiAgentSimulation wiring', () => {
  it('attaches a per-agent verdict and a page-level success report', () => {
    const sim = runMultiAgentSimulation(page, 'book a session')
    expect(sim.results).toHaveLength(5)
    for (const r of sim.results) {
      expect(r.verdict.agent).toBe(r.agent)
      expect(['recommend', 'needs_info', 'skip']).toContain(r.verdict.stance)
    }
    expect(sim.success.score).toBeGreaterThan(0)
    expect(sim.success.checks.length).toBe(7)
  })
})
