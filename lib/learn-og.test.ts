import { describe, expect, it } from 'vitest'
import { learnArticles } from './learn-content'
import { OG_LINE_MAX, ogEyebrow, ogToneForCategory, splitOgTitle } from './learn-og'

describe('splitOgTitle', () => {
  it('prefers the author’s own break over a balanced midpoint', () => {
    // The midpoint split of this title strands "A" at the end of line one.
    expect(splitOgTitle('What Is an MCP Server? A Business Owner’s Guide')).toEqual({
      title: 'What Is an MCP Server?',
      accent: 'A Business Owner’s Guide',
    })
    expect(splitOgTitle('How AI Agents Pay: A Merchant Guide')).toEqual({
      title: 'How AI Agents Pay:',
      accent: 'A Merchant Guide',
    })
  })

  it('ignores a trailing question mark, which punctuates rather than divides', () => {
    expect(splitOgTitle('Which AI Crawlers Should You Allow?')).toEqual({
      title: 'Which AI Crawlers',
      accent: 'Should You Allow?',
    })
  })

  it('uses the last break when a title has two', () => {
    expect(splitOgTitle('What Is llms.txt? Do You Actually Need One?')).toEqual({
      title: 'What Is llms.txt?',
      accent: 'Do You Actually Need One?',
    })
  })

  it('falls back to the midpoint when a punctuation break would leave a half too long', () => {
    // Splitting at the colon gives a 35-char second line, which clips.
    const { title, accent } = splitOgTitle('ACP in 2026: The Protocol After Instant Checkout')
    expect(title).toBe('ACP in 2026: The Protocol')
    expect(accent).toBe('After Instant Checkout')
  })

  it('splits a punctuation-free title at the word boundary nearest the midpoint', () => {
    expect(splitOgTitle('Sell on ChatGPT Without Shopify or Etsy')).toEqual({
      title: 'Sell on ChatGPT',
      accent: 'Without Shopify or Etsy',
    })
  })

  it('clips a line that would overflow the fixed card type', () => {
    const { title } = splitOgTitle(`${'x'.repeat(60)} tail`)
    expect(title.length).toBeLessThanOrEqual(OG_LINE_MAX)
    expect(title.endsWith('…')).toBe(true)
  })

  it('survives a single-word title without producing an empty first line', () => {
    expect(splitOgTitle('Overview')).toEqual({ title: 'Overview', accent: '' })
  })
})

describe('every published article renders a usable card', () => {
  it.each(learnArticles.map((a) => [a.slug, a] as const))('%s', (_slug, article) => {
    const { title, accent } = splitOgTitle(article.metaTitle)
    expect(title.length).toBeGreaterThan(0)
    expect(title.length).toBeLessThanOrEqual(OG_LINE_MAX)
    expect(accent.length).toBeGreaterThan(0)
    expect(accent.length).toBeLessThanOrEqual(OG_LINE_MAX)
    // No line may be clipped: every real metaTitle should fit as authored.
    expect(title).not.toContain('…')
    expect(accent).not.toContain('…')
    // Nothing is dropped in the split.
    expect(`${title} ${accent}`.replace(/\s+/g, ' ')).toBe(article.metaTitle.replace(/\s+/g, ' '))
    expect(ogEyebrow(article)).toContain(article.category)
    expect(['signal', 'ready', 'amber']).toContain(ogToneForCategory(article.category))
  })
})
