import { describe, expect, it } from 'vitest'
import { getReadinessScore } from '../agent-page'
import { detectAgentVisit, extractSearchQueryFromReferrer, isLikelyAgentUserAgent } from '../agent-detection'
import {
  AgentVisit,
  filterAgentVisits,
  getAgentTypeBreakdown,
  getReadinessTrendSummary,
  getTopPagesByAgentVisits,
  getTrafficSplit,
} from '../agent-visits'

const baseVisit: AgentVisit = {
  id: 'visit-1',
  page_id: 'page-1',
  owner_id: 'owner-1',
  slug: 'acme',
  path: '/acme',
  referrer: null,
  query: null,
  user_agent: null,
  ip_hash: null,
  is_ai_agent: false,
  agent_type: 'Human/Unknown',
  confidence_score: 12,
  detection_signals: {},
  created_at: new Date().toISOString(),
}

const basePage = {
  id: 'page-1',
  owner_id: 'owner-1',
  name: 'Acme Consulting',
  slug: 'acme',
  description: 'Strategy services for operators',
  website_url: 'https://acme.test',
  cta_url: 'https://acme.test/book',
  cta_label: 'Book now',
  audience: 'Founders',
  location: 'Remote',
  contact_email: 'hello@acme.test',
  industry: 'consulting',
  prefer_original_site: false,
  products: [],
  services: [{ name: 'Strategy Session', description: 'One hour strategy call', price: '$299', url: '' }],
  faqs: [{ question: 'How soon?', answer: 'This week.' }],
  is_published: true,
  created_at: new Date().toISOString(),
}

describe('agent detection', () => {
  it('classifies known AI user agents with high confidence', () => {
    const openAi = detectAgentVisit({ userAgent: 'GPTBot/1.0; OpenAI' })
    const claude = detectAgentVisit({ userAgent: 'ClaudeBot/1.0' })

    expect(openAi.is_ai_agent).toBe(true)
    expect(openAi.agent_type).toBe('ChatGPT / OpenAI')
    expect(openAi.confidence_score).toBeGreaterThanOrEqual(90)
    expect(claude.agent_type).toBe('Claude / Anthropic')
    expect(isLikelyAgentUserAgent('PerplexityBot/1.0')).toBe(true)
  })

  it('keeps ordinary browser traffic classified as human or unknown', () => {
    const result = detectAgentVisit({ userAgent: 'Mozilla/5.0 Safari/605.1.15' })

    expect(result.is_ai_agent).toBe(false)
    expect(result.agent_type).toBe('Human/Unknown')
    expect(result.confidence_score).toBeLessThan(20)
  })

  it('extracts search query context from AI referrers', () => {
    const referrer = 'https://www.perplexity.ai/search?q=book%20a%20strategy%20session'
    const result = detectAgentVisit({ referrer, hasIpSignal: true })

    expect(extractSearchQueryFromReferrer(referrer)).toBe('book a strategy session')
    expect(result.query).toBe('book a strategy session')
    expect(result.agent_type).toBe('Perplexity')
    expect(result.detection_signals.ip_signal_present).toBe(true)
  })
})

describe('agent visit analytics helpers', () => {
  const visits: AgentVisit[] = [
    {
      ...baseVisit,
      id: 'visit-ai-1',
      is_ai_agent: true,
      agent_type: 'ChatGPT / OpenAI',
      confidence_score: 96,
      user_agent: 'GPTBot/1.0',
      query: 'strategy session',
    },
    {
      ...baseVisit,
      id: 'visit-ai-2',
      page_id: 'page-2',
      slug: 'beta',
      path: '/beta',
      is_ai_agent: true,
      agent_type: 'Claude / Anthropic',
      confidence_score: 94,
      user_agent: 'ClaudeBot/1.0',
    },
    {
      ...baseVisit,
      id: 'visit-human-1',
      user_agent: 'Mozilla/5.0',
    },
  ]

  it('filters visits by traffic type and query context', () => {
    expect(filterAgentVisits(visits, { traffic: 'ai' })).toHaveLength(2)
    expect(filterAgentVisits(visits, { traffic: 'human' })).toHaveLength(1)
    expect(filterAgentVisits(visits, { query: 'strategy' })).toHaveLength(1)
  })

  it('summarizes AI traffic split, agent types, top pages, and readiness deltas', () => {
    const pages = [
      basePage,
      { ...basePage, id: 'page-2', slug: 'beta', name: 'Beta Studio' },
    ]
    const trend = getReadinessTrendSummary([
      {
        ...basePage,
        versions: [
          {
            timestamp: new Date().toISOString(),
            name: 'Draft Acme',
            description: null,
            services: [],
            products: [],
            faqs: [],
          },
        ],
      },
    ])

    expect(getTrafficSplit(visits)).toEqual({ ai: 2, human: 1, total: 3 })
    expect(getAgentTypeBreakdown(visits).map((row) => row.agentType)).toEqual([
      'ChatGPT / OpenAI',
      'Claude / Anthropic',
    ])
    expect(getTopPagesByAgentVisits(visits, pages)[0]).toMatchObject({ slug: 'acme', total: 1 })
    expect(trend.currentAverage).toBe(getReadinessScore(basePage))
    expect(trend.delta).toBeGreaterThanOrEqual(0)
  })
})
