import { describe, expect, it } from 'vitest'
import { learnArticles } from './learn-content'
import { headingsOf, slugifyHeading, tocOf } from './learn-headings'

describe('slugifyHeading', () => {
  it('produces url-safe fragments', () => {
    expect(slugifyHeading('The robots.txt asymmetry, and why blanket blocking backfires')).toBe(
      'the-robots-txt-asymmetry-and-why-blanket-blocking-backfires',
    )
    expect(slugifyHeading('Claude: there is no shopping surface, on purpose')).toBe(
      'claude-there-is-no-shopping-surface-on-purpose',
    )
  })

  it('never leaves a leading or trailing hyphen, even after the length clamp', () => {
    const long = slugifyHeading(`${'word '.repeat(30)}end`)
    expect(long.startsWith('-')).toBe(false)
    expect(long.endsWith('-')).toBe(false)
    expect(long.length).toBeLessThanOrEqual(60)
  })

  it('falls back rather than emitting an empty id', () => {
    expect(slugifyHeading('///')).toBe('')
  })
})

describe.each(learnArticles.map((a) => [a.slug, a] as const))('headings: %s', (slug, article) => {
  it('gives every heading a non-empty, url-safe id', () => {
    for (const h of headingsOf(article)) {
      expect(h.id, `${slug}: "${h.text}"`).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    }
  })

  it('keeps ids unique within the article', () => {
    // Two headings sharing an id silently points two contents entries at one anchor.
    const ids = headingsOf(article).map((h) => h.id)
    expect(new Set(ids).size, `${slug} has duplicate heading ids`).toBe(ids.length)
  })

  it('emits one heading per heading block, in document order', () => {
    const blocks = article.blocks.filter((b) => b.type === 'h2' || b.type === 'h3')
    const headings = headingsOf(article)
    expect(headings.length).toBe(blocks.length)
    headings.forEach((h, i) => {
      const block = blocks[i]!
      expect(h.text).toBe('text' in block ? block.text : '')
    })
  })

  it('has enough top-level sections for a contents list to earn its space', () => {
    expect(tocOf(article).length).toBeGreaterThanOrEqual(3)
  })
})
