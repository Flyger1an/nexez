import { describe, expect, it } from 'vitest'
import {
  AGENT_BOTS,
  CHECK_WEIGHTS,
  DIMENSION_WEIGHTS,
  evaluateCrawlability,
  parseRobotsForAgentBots,
  type CrawlabilitySignals,
} from '../crawlability'

describe('parseRobotsForAgentBots', () => {
  it('allows all bots when robots.txt is empty or missing', () => {
    const result = parseRobotsForAgentBots(null)
    for (const bot of AGENT_BOTS) expect(result[bot]).toBe(true)
  })

  it('blocks one specific bot while wildcard remains open', () => {
    const result = parseRobotsForAgentBots('User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nDisallow:')
    expect(result.GPTBot).toBe(false)
    expect(result.ClaudeBot).toBe(true)
  })

  it('supports grouped agents and Allow winning an equal-length tie', () => {
    const robots = [
      'User-agent: ClaudeBot',
      'User-agent: Claude-SearchBot',
      'Disallow: /*',
      'Allow: /$',
      '',
      'User-agent: *',
      'Disallow: /',
    ].join('\n')
    const result = parseRobotsForAgentBots(robots)
    expect(result.ClaudeBot).toBe(true)
    expect(result['Claude-SearchBot']).toBe(true)
    expect(result.GPTBot).toBe(false)
  })

  it('blocks all through a wildcard root rule', () => {
    const result = parseRobotsForAgentBots('User-agent: *\nDisallow: /')
    for (const bot of AGENT_BOTS) expect(result[bot]).toBe(false)
  })
})

function allAllowed() {
  return Object.fromEntries(AGENT_BOTS.map((bot) => [bot, true])) as Record<(typeof AGENT_BOTS)[number], boolean>
}

const perfectSignals: CrawlabilitySignals = {
  status: 200,
  responseMs: 150,
  https: true,
  hasJsonLd: true,
  validJsonLd: true,
  schemaTypes: ['Organization', 'Offer', 'Service'],
  hasTitle: true,
  hasMetaDescription: true,
  hasH1: true,
  hasBusinessIdentity: true,
  hasOfferSchema: true,
  hasStructuredPrice: true,
  hasVisiblePrice: true,
  hasActionPath: true,
  hasStructuredAction: true,
  hasStructuredAvailability: true,
  hasVisibleAvailability: true,
  hasOfferDetails: true,
  hasContact: true,
  hasPolicies: true,
  hasFreshnessSignal: true,
  agentJsonOk: true,
  wellKnownAgentJsonOk: true,
  wellKnownAgentCardOk: false,
  mcpJsonOk: true,
  openApiJsonOk: true,
  llmsTxtOk: true,
  robots: allAllowed(),
}

describe('evaluateCrawlability V2', () => {
  it('scores complete evidence at 100 across all dimensions', () => {
    const report = evaluateCrawlability(perfectSignals)
    expect(report.version).toBe(2)
    expect(report.score).toBe(100)
    expect(report.checks.every((check) => check.status === 'pass')).toBe(true)
    for (const dimension of Object.values(report.dimensions)) expect(dimension.score).toBe(100)
    expect(Object.values(CHECK_WEIGHTS).reduce((sum, value) => sum + value, 0)).toBe(100)
    expect(Object.values(DIMENSION_WEIGHTS).reduce((sum, value) => sum + value, 0)).toBe(100)
  })

  it('does not confuse a JSON-LD script with a structured offer', () => {
    const report = evaluateCrawlability({
      ...perfectSignals,
      validJsonLd: false,
      schemaTypes: [],
      hasBusinessIdentity: false,
      hasOfferSchema: false,
      hasStructuredPrice: false,
      hasStructuredAction: false,
      hasStructuredAvailability: false,
      hasOfferDetails: false,
    })
    expect(report.checks.find((check) => check.id === 'jsonld')?.status).toBe('warn')
    expect(report.checks.find((check) => check.id === 'offer_schema')?.status).toBe('fail')
    expect(report.checks.find((check) => check.id === 'pricing')?.status).toBe('warn')
    expect(report.dimensions.understanding.score).toBeLessThan(50)
    expect(report.score).toBeLessThan(80)
  })

  it('warns when only some evaluated crawlers are blocked', () => {
    const robots = allAllowed()
    robots.GPTBot = false
    const report = evaluateCrawlability({ ...perfectSignals, robots })
    expect(report.checks.find((check) => check.id === 'robots')?.status).toBe('warn')
  })

  it('passes discovery documents with two meaningful endpoint formats', () => {
    const report = evaluateCrawlability({
      ...perfectSignals,
      agentJsonOk: false,
      wellKnownAgentJsonOk: true,
      wellKnownAgentCardOk: false,
      mcpJsonOk: false,
      openApiJsonOk: true,
    })
    expect(report.checks.find((check) => check.id === 'agent_docs')?.status).toBe('pass')
  })

  it('fails agent documents when every probe lacks meaningful data', () => {
    const report = evaluateCrawlability({
      ...perfectSignals,
      agentJsonOk: false,
      wellKnownAgentJsonOk: false,
      wellKnownAgentCardOk: false,
      mcpJsonOk: false,
      openApiJsonOk: false,
    })
    expect(report.checks.find((check) => check.id === 'agent_docs')?.status).toBe('fail')
    expect(report.dimensions.discovery.score).toBeLessThan(100)
  })
})
