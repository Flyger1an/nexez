import { describe, expect, it } from 'vitest'
import { getLearnArticle, learnArticles } from './learn-content'
import { outboundSlugs, relatedArticles } from './learn-related'

describe('outboundSlugs', () => {
  it('reads the prose link graph and excludes self-links', () => {
    const article = getLearnArticle('perplexity-and-claude-shopping')!
    const out = outboundSlugs(article)
    expect(out).toContain('which-ai-crawlers-to-allow')
    expect(out).not.toContain(article.slug)
  })

  it('only returns slugs that resolve', () => {
    for (const article of learnArticles) {
      for (const slug of outboundSlugs(article)) {
        expect(getLearnArticle(slug), `${article.slug} links to missing /learn/${slug}`).toBeTruthy()
      }
    }
  })
})

describe.each(learnArticles.map((a) => [a.slug, a] as const))('related: %s', (slug, article) => {
  it('is never orphaned', () => {
    // The real failure mode of a computed graph is a new article nothing links to
    // and which links nowhere. The same-category fallback guarantees a floor, and
    // this is the gate that proves the floor holds.
    expect(relatedArticles(article).length, `${slug} has too few related articles`).toBeGreaterThanOrEqual(2)
  })

  it('never suggests itself, and never repeats', () => {
    const related = relatedArticles(article)
    const slugs = related.map((r) => r.slug)
    expect(slugs).not.toContain(slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('carries a renderable summary and read time', () => {
    for (const r of relatedArticles(article)) {
      expect(r.summary.length).toBeGreaterThan(20)
      expect(r.readMinutes).toBeGreaterThan(0)
      expect(r.title.length).toBeGreaterThan(5)
    }
  })
})
