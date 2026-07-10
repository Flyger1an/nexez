import { describe, expect, it } from 'vitest'
import {
  AGENT_BOTS,
  evaluateCrawlability,
  parseRobotsForAgentBots,
  type CrawlabilitySignals,
} from '../crawlability'

describe('parseRobotsForAgentBots', () => {
  it('allows all bots when robots.txt is empty/missing', () => {
    const r = parseRobotsForAgentBots(null)
    for (const b of AGENT_BOTS) expect(r[b]).toBe(true)
  })

  it('blocks a specific bot via its own group', () => {
    const robots = 'User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nDisallow:'
    const r = parseRobotsForAgentBots(robots)
    expect(r['GPTBot']).toBe(false)
    expect(r['ClaudeBot']).toBe(true) // falls back to * (allow-all)
  })

  it('blocks all via wildcard Disallow: /', () => {
    const r = parseRobotsForAgentBots('User-agent: *\nDisallow: /')
    for (const b of AGENT_BOTS) expect(r[b]).toBe(false)
  })

  it('treats empty Disallow as allow', () => {
    const r = parseRobotsForAgentBots('User-agent: *\nDisallow:')
    for (const b of AGENT_BOTS) expect(r[b]).toBe(true)
  })
})

function allAllowed() {
  return Object.fromEntries(AGENT_BOTS.map((b) => [b, true])) as Record<(typeof AGENT_BOTS)[number], boolean>
}

const perfectSignals: CrawlabilitySignals = {
  status: 200,
  responseMs: 150,
  hasJsonLd: true,
  hasTitle: true,
  hasMetaDescription: true,
  hasH1: true,
  agentJsonOk: true,
  llmsTxtOk: true,
  robots: allAllowed(),
}

describe('evaluateCrawlability', () => {
  it('scores a perfect page 100', () => {
    const report = evaluateCrawlability(perfectSignals)
    expect(report.score).toBe(100)
    expect(report.checks.every((c) => c.status === 'pass')).toBe(true)
  })

  it('fails reachability + zeroes the big weights when down', () => {
    const report = evaluateCrawlability({ ...perfectSignals, status: 0, responseMs: 0 })
    expect(report.checks.find((c) => c.id === 'reachable')?.status).toBe('fail')
    expect(report.score).toBeLessThan(100)
  })

  it('marks JSON-LD + agent.json failures and lowers the score', () => {
    const report = evaluateCrawlability({ ...perfectSignals, hasJsonLd: false, agentJsonOk: false })
    expect(report.checks.find((c) => c.id === 'jsonld')?.status).toBe('fail')
    expect(report.checks.find((c) => c.id === 'agent_json')?.status).toBe('fail')
    expect(report.score).toBe(60) // 100 - 20 (jsonld) - 20 (agent_json)
  })

  it('warns (not fails) when only some agent bots are blocked', () => {
    const robots = allAllowed()
    robots['GPTBot'] = false
    const report = evaluateCrawlability({ ...perfectSignals, robots })
    expect(report.checks.find((c) => c.id === 'robots')?.status).toBe('warn')
  })

  it('passes agent_json when only /.well-known/agent.json is present', () => {
    const report = evaluateCrawlability({ ...perfectSignals, agentJsonOk: false, wellKnownAgentJsonOk: true })
    const check = report.checks.find((c) => c.id === 'agent_json')
    expect(check?.status).toBe('pass')
    expect(check?.detail).toContain('.well-known')
    expect(report.score).toBe(100)
  })

  it('fails agent_json only when neither location is present', () => {
    const report = evaluateCrawlability({ ...perfectSignals, agentJsonOk: false, wellKnownAgentJsonOk: false })
    expect(report.checks.find((c) => c.id === 'agent_json')?.status).toBe('fail')
    expect(report.score).toBe(80) // 100 - 20 (agent_json)
  })

  it('is backward-compatible when wellKnownAgentJsonOk is undefined (root pass ⇒ pass)', () => {
    const report = evaluateCrawlability({ ...perfectSignals, agentJsonOk: true })
    expect(report.checks.find((c) => c.id === 'agent_json')?.status).toBe('pass')
    expect(report.score).toBe(100)
  })
})
