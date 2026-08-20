import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { marketingUrl } from '../lib/site'
import { metadata } from './page'

const source = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8')
const sourceLower = source.toLowerCase()

const preservedHero = [
  'Get found by the agents',
  'doing the buying.',
  'AI agents already shop on behalf of real customers. Nexez makes your business the one they find, compare, and buy from.',
  'List your offers',
  'See how it works',
]

const retiredListingEraClaims = [
  'maps every offer to schema agents trust',
  'json-ld, llms.txt, agent.json, and mcp',
  'set it once. sell on autopilot.',
  'your listing never goes stale.',
  'no agent ever sees an old price.',
  'transacts with every major agent',
  'one listing, every agent.',
]

describe('/ homepage commerce story', () => {
  it('preserves the existing hero copy', () => {
    for (const phrase of preservedHero) {
      expect(source).toContain(phrase)
    }
  })

  it('centers merchant control and real commerce behavior below the hero', () => {
    expect(sourceLower).toContain('ai gets a buying path, not control of your business')
    expect(sourceLower).toContain('bad-fit orders can stop before payment')
    expect(sourceLower).toContain('repeat services')
    expect(sourceLower).toContain('buyer questions')
    expect(sourceLower).toContain('nexez checks the order')
    expect(sourceLower).toContain('before money moves')
    expect(sourceLower).toContain('run a buying scenario before a real buyer does')
  })

  it('retires old listing-era framing and unsupported absolutes', () => {
    for (const phrase of retiredListingEraClaims) {
      expect(sourceLower).not.toContain(phrase)
    }
  })

  it('uses commerce-focused homepage metadata', () => {
    expect(metadata.title).toBe('Nexez - Commerce for AI agents')
    expect(metadata.description).toMatch(/prices, requirements, and rules stay under your control/i)
    expect(metadata.alternates?.canonical).toBe(marketingUrl('/'))
    expect(metadata.openGraph?.url).toBe(marketingUrl('/'))
    expect(metadata.openGraph?.title).toBe(metadata.title)
    expect(metadata.openGraph?.description).toBe(metadata.description)
  })
})
