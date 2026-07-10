import { describe, expect, it, vi, beforeEach } from 'vitest'

const llmComplete = vi.fn()
const isLlmConfigured = vi.fn(() => true)
const gatherSiteSignals = vi.fn()

vi.mock('../llm', () => ({
  llmComplete: (...a: unknown[]) => llmComplete(...a),
  isLlmConfigured: () => isLlmConfigured(),
}))
vi.mock('../server/site-scan', () => ({
  gatherSiteSignals: (...a: unknown[]) => gatherSiteSignals(...a),
}))

import { runDeepScan, parseComprehension } from '../server/deep-scan'
import type { AgentBot } from '../crawlability'

const allowedRobots = (): Record<AgentBot, boolean> =>
  ({ GPTBot: true, 'OAI-SearchBot': true, 'ChatGPT-User': true, ClaudeBot: true, 'Claude-Web': true, PerplexityBot: true, 'Google-Extended': true }) as Record<AgentBot, boolean>

// A site with good structure but WEAK content: JSON-LD + agent.json present (so the
// deterministic semantics check would pass on title+desc+h1), pageText present.
function goodSignals(pageText = 'We do plumbing. Call us. Great service since 1990.') {
  return {
    url: 'https://acme.com/',
    origin: 'https://acme.com',
    elapsedMs: 50,
    robots: allowedRobots(),
    pageText,
    signals: {
      status: 200,
      responseMs: 100,
      hasJsonLd: true,
      hasTitle: true,
      hasMetaDescription: true,
      hasH1: true,
      agentJsonOk: true,
      llmsTxtOk: true,
      robots: allowedRobots(),
    },
  }
}

describe('parseComprehension', () => {
  it('extracts a clean JSON object', () => {
    const out = parseComprehension('{"score":72,"agentRead":"I can see offers.","topFix":"Add prices."}')
    expect(out).toEqual({ score: 72, agentRead: 'I can see offers.', topFix: 'Add prices.' })
  })
  it('tolerates prose/fences around the object + clamps score', () => {
    const out = parseComprehension('Sure!\n```json\n{"score": 140, "agentRead": "x", "topFix": "y"}\n```\nHope that helps')
    expect(out?.score).toBe(100) // clamped
    expect(out?.agentRead).toBe('x')
  })
  it('returns null on garbage / missing fields / non-JSON', () => {
    expect(parseComprehension(null)).toBeNull()
    expect(parseComprehension('no json here')).toBeNull()
    expect(parseComprehension('{"score":50}')).toBeNull() // no agentRead
    expect(parseComprehension('{"agentRead":"x"}')).toBeNull() // no score
  })
})

describe('runDeepScan', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isLlmConfigured.mockReturnValue(true)
  })

  it('propagates the SSRF/guard error from gatherSiteSignals', async () => {
    gatherSiteSignals.mockResolvedValue({ error: 'Blocked private host' })
    expect(await runDeepScan('http://169.254.169.254', { llm: true })).toEqual({ error: 'Blocked private host' })
    expect(llmComplete).not.toHaveBeenCalled()
  })

  it('LLM refines ONLY the content dimension and re-scores (structural checks untouched)', async () => {
    gatherSiteSignals.mockResolvedValue(goodSignals())
    // Agent finds the content weak → comprehension 30 → the semantics(10w) check → fail.
    llmComplete.mockResolvedValue('{"score":30,"agentRead":"I cannot tell what you sell or the price.","topFix":"List services with prices."}')

    const out = await runDeepScan('acme.com', { llm: true })
    if ('error' in out) throw new Error('unexpected error')

    expect(out.llmAssisted).toBe(true)
    expect(out.comprehension).toEqual({ score: 30, agentRead: 'I cannot tell what you sell or the price.', topFix: 'List services with prices.' })
    const contentCheck = out.checks.find((c) => c.id === 'semantics')!
    expect(contentCheck.label).toBe('Agent comprehension of your offers')
    expect(contentCheck.status).toBe('fail') // 30 < 40
    // Deterministic would score 100 (all pass). Refined: semantics 10w flips pass→fail = -10.
    expect(out.score).toBe(90)
    // A STRUCTURAL check is unchanged.
    expect(out.checks.find((c) => c.id === 'jsonld')!.status).toBe('pass')
  })

  it('falls back to the deterministic report when the LLM returns unusable output', async () => {
    gatherSiteSignals.mockResolvedValue(goodSignals())
    llmComplete.mockResolvedValue('the model rambled without JSON')

    const out = await runDeepScan('acme.com', { llm: true })
    if ('error' in out) throw new Error('unexpected error')
    expect(out.llmAssisted).toBe(false)
    expect(out.comprehension).toBeUndefined()
    expect(out.score).toBe(100) // deterministic all-pass, semantics untouched
    expect(out.checks.find((c) => c.id === 'semantics')!.label).toBe('Semantic basics (title, description, h1)')
  })

  it('skips the LLM entirely when not entitled (llm:false) — never calls the model', async () => {
    gatherSiteSignals.mockResolvedValue(goodSignals())
    const out = await runDeepScan('acme.com', { llm: false })
    if ('error' in out) throw new Error('unexpected error')
    expect(out.llmAssisted).toBe(false)
    expect(llmComplete).not.toHaveBeenCalled()
  })

  it('skips the LLM when it is not configured (deterministic fallback)', async () => {
    isLlmConfigured.mockReturnValue(false)
    gatherSiteSignals.mockResolvedValue(goodSignals())
    const out = await runDeepScan('acme.com', { llm: true })
    if ('error' in out) throw new Error('unexpected error')
    expect(out.llmAssisted).toBe(false)
    expect(llmComplete).not.toHaveBeenCalled()
  })

  it('skips the LLM when the page has no readable content', async () => {
    gatherSiteSignals.mockResolvedValue(goodSignals('tiny'))
    const out = await runDeepScan('acme.com', { llm: true })
    if ('error' in out) throw new Error('unexpected error')
    expect(out.llmAssisted).toBe(false)
    expect(llmComplete).not.toHaveBeenCalled()
  })
})
