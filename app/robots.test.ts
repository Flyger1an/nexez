import { describe, it, expect, vi, beforeEach } from 'vitest'

const { hostRef } = vi.hoisted(() => ({
  hostRef: { host: 'nexez.test' },
}))

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ host: hostRef.host }),
}))

import robots from './robots'
import { AGENT_RUNTIME_HOST, APP_HOST, MARKETING_HOST } from '../lib/site'

describe('robots()', () => {
  beforeEach(() => {
    hostRef.host = AGENT_RUNTIME_HOST
  })

  it('app host: disallows everything and advertises NO sitemap (a sitemap on a fully blocked host is contradictory)', async () => {
    hostRef.host = APP_HOST
    const result = await robots()
    expect(result.rules).toEqual([{ userAgent: '*', disallow: '/' }])
    expect(result.sitemap).toBeUndefined()
  })

  it('marketing host: allows crawling and points at its own sitemap', async () => {
    hostRef.host = MARKETING_HOST
    const result = await robots()
    const rules = Array.isArray(result.rules) ? result.rules : [result.rules]
    expect(rules[0]).toMatchObject({ userAgent: '*', allow: '/' })
    expect(rules[0]).toMatchObject({ disallow: ['/discovery', '/leaderboard'] })
    expect(result.sitemap).toBe(`https://${MARKETING_HOST}/sitemap.xml`)
  })

  it('agent runtime host: allows crawling (incl. the AI-agent allowlist) and keeps its sitemap', async () => {
    const result = await robots()
    const rules = Array.isArray(result.rules) ? result.rules : [result.rules]
    expect(rules[0]).toMatchObject({ userAgent: '*', allow: '/' })
    expect(rules[0]).toMatchObject({ disallow: ['/discovery', '/leaderboard'] })
    expect(JSON.stringify(rules)).toContain('ClaudeBot')
    expect(result.sitemap).toBe(`https://${AGENT_RUNTIME_HOST}/sitemap.xml`)
  })
})
