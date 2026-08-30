import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8')
const styles = readFileSync(new URL('./globals.css', import.meta.url), 'utf8')
const readinessSource = readFileSync(new URL('../components/home/ReadinessLab.tsx', import.meta.url), 'utf8')
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
      'Nexez helps AI find, understand, and buy what your business sells.',
    )
    expect(hero).toContain('List your offers')
    expect(hero).toContain('See how it works')
    expect(hero).toContain('stats.map')
    expect(hero).toContain('<AgentXray />')
    expect(source).toContain("{ value: '<200ms', label: 'Fast pages' }")
    expect(source).toContain("{ value: '19+', label: 'AI assistants' }")
    expect(source).toContain("{ value: '10+', label: 'Connections' }")
    expect(source).toContain("{ value: 'Live', label: 'Sales insights' }")
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
    expect(source).toContain("title: 'Review each sale'")
    expect(source).toContain('Run a buying scenario before a real buyer does.')
    expect(source).toContain('AI gets a buying path, not control of your business.')
  })

  it('keeps broader platform capabilities visible', () => {
    expect(source).toContain("title: 'Copilot'")
    expect(source).toContain("title: 'Your brand, your domain'")
    expect(source).toContain("title: 'Trust context'")
  })

  it('makes supported merchant integrations visible without changing the hero promise', () => {
    expect(source).toContain('Connects with the tools your business already uses')
    expect(source).toContain("const integrationRail = ['Stripe', 'Shopify', 'Square', 'Calendly', 'Acuity', 'Google Calendar']")
    expect(source).toContain('Your existing tools become')
    expect(source).toContain('one clear buying path.')
    expect(source).toContain('Review every offer before it goes live.')
    expect(source).toContain('Explore integrations')
    expect(source).toContain('Plus your website, CSV, Excel, and Zapier.')
  })

  it('keeps the mobile homepage compact without sideways content rails', () => {
    expect(source).toContain('nx-home-proof-grid')
    expect(source).toContain('nx-home-flow-mobile')
    expect(source).toContain('nx-home-story-disclosure')
    expect(source).toContain('nx-home-capabilities-disclosure')
    expect(source).toContain('nx-home-integration-mobile')
    expect(source).toContain('nx-home-workflow-mobile')
    expect(readinessSource).toContain('nx-home-readiness-grid')
    expect(styles).not.toContain('scroll-snap-type: x mandatory')
    expect(source).toContain('nx-home-simulator-compact')
    expect(source).toContain('Open the simulator')
  })

  it('gives the homepage modern merchant-facing metadata', () => {
    expect(source).toContain("const metaTitle = 'Nexez - Commerce for AI agents'")
    expect(source).toContain(
      "'Help customers and AI assistants buy from your business while your prices, requirements, and rules stay under your control.'",
    )
  })
})
