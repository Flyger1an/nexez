import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8')
const hero = source.split('{/* HERO - text + CTAs on the left, the draggable Agent X-Ray prominent on the right */}')[1]
  ?.split('{/* AGENT LOGO MARQUEE */}')[0] ?? ''
const body = source.split('{/* AGENT LOGO MARQUEE */}')[1] ?? ''

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
    expect(hero).toContain("{ value: '<200ms', label: 'Agent-ready load' }")
    expect(hero).toContain("{ value: '19+', label: 'AI crawlers welcomed' }")
    expect(hero).toContain("{ value: '5+', label: 'Structured formats' }")
    expect(hero).toContain("{ value: 'Live', label: 'Conversion analytics' }")
    expect(hero).toContain('<AgentXray />')
  })

  it('retires the old publishing-first and absolute-claim story below the hero', () => {
    for (const phrase of retiredHomepageClaims) {
      expect(body).not.toContain(phrase)
    }
  })

  it('centers merchant control and the real commerce rails', () => {
    expect(body).toContain('Your prices stay yours.')
    expect(body).toContain('Bad-fit orders can stop before payment.')
    expect(body).toContain('Repeat work can stay repeatable.')
    expect(body).toContain('before money moves')
    expect(body).toContain('Run a buying scenario before a real buyer does.')
    expect(body).toContain('AI gets a buying path, not control of your business.')
  })

  it('gives the homepage modern merchant-facing metadata', () => {
    expect(source).toContain("const metaTitle = 'Commerce for AI agents'")
    expect(source).toContain(
      "'Help customers and AI assistants buy from your business while your prices, requirements, and rules stay under your control.'",
    )
  })
})
