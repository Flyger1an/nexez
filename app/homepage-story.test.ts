import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8')
const hero = source.split('{/* HERO - text + CTAs on the left, the draggable Agent X-Ray prominent on the right */}')[1]
  ?.split('{/* AGENT LOGO MARQUEE */}')[0] ?? ''

const retiredHomepageClaims = [
  'Transacts with every major agent',
  'schema agents trust',
  'JSON-LD, llms.txt, agent.json, and MCP',
  'no upkeep required',
  'Your listing never goes stale',
  'No agent ever sees an old price',
  'every major buyer agent',
  'structured version they need to act',
  'Zero ambiguity',
]

describe('homepage commerce story', () => {
  it('preserves the approved homepage hero', () => {
    expect(hero).toContain('Get found by the agents')
    expect(hero).toContain('doing the buying.')
    expect(hero).toContain(
      'AI agents already shop on behalf of real customers. Nexez makes your business the one they find, compare, and buy from.',
    )
    expect(hero).toContain('List your offers')
    expect(hero).toContain('See how it works')
    expect(hero).toContain('stats.map')
    expect(hero).toContain('<AgentXray />')
    expect(source).toContain("{ value: '<200ms', label: 'Agent-ready load' }")
    expect(source).toContain("{ value: '19+', label: 'AI crawlers welcomed' }")
    expect(source).toContain("{ value: '5+', label: 'Structured formats' }")
    expect(source).toContain("{ value: 'Live', label: 'Conversion analytics' }")
  })

  it('retires the old publishing-first and absolute-claim story', () => {
    for (const phrase of retiredHomepageClaims) {
      expect(source).not.toContain(phrase)
    }
  })

  it('centers merchant control and the real commerce rails', () => {
    expect(source).toContain('Your prices stay yours.')
    expect(source).toContain('Bad-fit orders can stop before payment.')
    expect(source).toContain('Repeat work can stay repeatable.')
    expect(source).toContain('before money moves')
    expect(source).toContain('Run a buying scenario before a real buyer does.')
    expect(source).toContain('AI gets a buying path, not control of your business.')
  })

  it('keeps broader platform capabilities visible', () => {
    expect(source).toContain("title: 'Copilot'")
    expect(source).toContain("title: 'Your brand, your domain'")
    expect(source).toContain("title: 'Trust context'")
  })

  it('gives the homepage modern merchant-facing metadata', () => {
    expect(source).toContain("const metaTitle = 'Commerce for AI agents'")
    expect(source).toContain(
      "'Help customers and AI assistants buy from your business while your prices, requirements, and rules stay under your control.'",
    )
  })
})
