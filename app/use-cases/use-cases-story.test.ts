import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { useCases } from '../../lib/marketing-content'
import {
  getUseCaseCommerceStory,
  useCaseCommerceStories,
} from '../../lib/use-case-commerce-story'
import { metadata } from './page'

const indexSource = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8')
const detailSource = readFileSync(new URL('./[slug]/page.tsx', import.meta.url), 'utf8')
const copy = JSON.stringify(useCaseCommerceStories).toLowerCase()

const architectureJargon = [
  'agent.json',
  'deterministic',
  'machine-readable',
  'manifest',
  'mcp',
  'multi-provider orchestration',
  'provenance',
  'schema',
]

describe('use case commerce story', () => {
  it('covers every published use-case route', () => {
    expect(useCaseCommerceStories).toHaveLength(useCases.length)

    for (const useCase of useCases) {
      expect(getUseCaseCommerceStory(useCase.slug)).toBeDefined()
    }
  })

  it('uses merchant language instead of architecture language', () => {
    for (const term of architectureJargon) {
      expect(copy).not.toContain(term)
    }

    expect(copy).toContain('you keep control')
    expect(copy).toContain('rules')
    expect(copy).toContain('stop before payment')
    expect(copy).toContain('repeat services')
  })

  it('uses the real local-service buying pattern', () => {
    const local = getUseCaseCommerceStory('local-services')
    expect(local?.buyerRequest).toMatch(/move-out cleaning/i)
    expect(local?.buyerRequest).toMatch(/two-bedroom, two-bath/i)
    expect(local?.nexezHandles.map((item) => item.title).join(' ')).toMatch(/repeat service/i)
    expect(local?.merchantControls.map((item) => item.title).join(' ')).toMatch(/acceptance rules/i)
  })

  it('does not promise a several-provider order that Nexez does not support yet', () => {
    const marketplace = getUseCaseCommerceStory('marketplaces')
    expect(marketplace?.outcome).toMatch(/one order involving several providers/i)
    expect(marketplace?.faq.map((item) => item.copy).join(' ')).toMatch(/not today/i)
    expect(marketplace?.faq.map((item) => item.copy).join(' ')).toMatch(/keeps each provider purchase separate/i)
  })

  it('renders the new buyer → merchant control → Nexez handling model', () => {
    expect(indexSource).toContain('Different businesses.')
    expect(indexSource).toContain('Same control.')
    expect(indexSource).toContain('You set the rules')
    expect(indexSource).toContain('Nexez checks the request')

    expect(detailSource).toContain('story.buyerRequest')
    expect(detailSource).toContain('story.merchantControls')
    expect(detailSource).toContain('story.nexezHandles')
    expect(detailSource).toContain('story.outcome')
    expect(detailSource).not.toContain('useCase.pain')
    expect(detailSource).not.toContain('useCase.pageMustProve')
  })

  it('uses merchant-facing metadata on the use-case index', () => {
    expect(metadata.title).toBe('Use Cases — Sell Through AI on Your Terms')
    expect(metadata.description).toMatch(/without giving up merchant control/i)
  })
})
