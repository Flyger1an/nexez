import { describe, expect, it } from 'vitest'
import { getLearnArticle, learnArticles, type LearnArticle } from './learn-content'

// House-style gate for /learn. These rules were enforced by hand on every article
// until now, which is exactly the kind of check that survives until the session
// that forgets one. The costs of a miss are silent and external: a clipped title
// in search results, a dead internal link, a table that renders ragged, a share
// card with no image, an em dash in published copy.

const EM_DASH = String.fromCharCode(0x2014)

/** The layout appends ' · Nexez' (8 chars) to every page title. */
const TITLE_TEMPLATE_CHARS = 8
const TITLE_MAX = 60
const DESCRIPTION_MAX = 160

function proseOf(article: LearnArticle): string[] {
  const out: string[] = []
  for (const block of article.blocks) {
    if (block.type === 'p' || block.type === 'h2' || block.type === 'h3') out.push(block.text)
    if (block.type === 'ul' || block.type === 'ol') out.push(...block.items)
    if (block.type === 'callout') {
      out.push(block.text)
      if (block.title) out.push(block.title)
    }
    if (block.type === 'cta') out.push(block.title, block.text, block.label)
    if (block.type === 'table') out.push(...block.headers, ...block.rows.flat())
  }
  for (const faq of article.faqs) out.push(faq.question, faq.answer)
  return out
}

describe('learn content registry', () => {
  it('has no duplicate slugs', () => {
    const slugs = learnArticles.map((a) => a.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('resolves every registered slug through getLearnArticle', () => {
    for (const article of learnArticles) {
      expect(getLearnArticle(article.slug)).toBe(article)
    }
    expect(getLearnArticle('not-a-real-article')).toBeUndefined()
  })

  it('uses url-safe slugs (they are route segments and canonical URLs)', () => {
    for (const article of learnArticles) {
      expect(article.slug, article.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    }
  })
})

describe.each(learnArticles.map((a) => [a.slug, a] as const))('learn article: %s', (slug, article) => {
  it('keeps metaTitle inside the 60-char budget once the layout template is applied', () => {
    expect(article.metaTitle.length + TITLE_TEMPLATE_CHARS).toBeLessThanOrEqual(TITLE_MAX)
    expect(article.metaTitle.length).toBeGreaterThan(0)
    // The template supplies the brand; a self-branded title double-brands.
    expect(article.metaTitle).not.toMatch(/nexez/i)
  })

  it('keeps metaDescription inside the 160-char budget', () => {
    expect(article.metaDescription.length).toBeLessThanOrEqual(DESCRIPTION_MAX)
    expect(article.metaDescription.length).toBeGreaterThan(0)
  })

  it('carries ISO dates with updatedAt no earlier than publishedAt', () => {
    // These drive Article JSON-LD and sitemap lastmod, so a malformed or
    // reversed pair is published misinformation rather than a cosmetic bug.
    expect(article.publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(article.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(Number.isNaN(Date.parse(article.publishedAt))).toBe(false)
    expect(Number.isNaN(Date.parse(article.updatedAt))).toBe(false)
    expect(article.updatedAt >= article.publishedAt).toBe(true)
  })

  it('gives every table row exactly as many cells as it has headers', () => {
    for (const block of article.blocks) {
      if (block.type !== 'table') continue
      expect(block.headers.length).toBeGreaterThan(1)
      for (const row of block.rows) {
        expect(row.length, `row "${row[0]}"`).toBe(block.headers.length)
      }
    }
  })

  it('links only to /learn slugs that exist', () => {
    for (const text of proseOf(article)) {
      for (const match of text.matchAll(/\]\((\/learn\/[^)\s]+)\)/g)) {
        const target = match[1]!.replace('/learn/', '')
        expect(getLearnArticle(target), `${slug} links to missing /learn/${target}`).toBeTruthy()
      }
    }
  })

  it('does not link to itself', () => {
    for (const text of proseOf(article)) {
      expect(text).not.toContain(`](/learn/${slug})`)
    }
  })

  it('leaves no unclosed markdown link syntax (the renderer only handles the full form)', () => {
    for (const text of proseOf(article)) {
      // Literal square brackets are legal prose. What is not legal is a "](",
      // the middle of a link, that is not part of a complete [label](href).
      const middles = (text.match(/\]\(/g) || []).length
      const links = [...text.matchAll(/\[([^\]]+)\]\(([^)\s]+)\)/g)].length
      expect(middles, `unbalanced link syntax in ${slug}: ${text.slice(0, 80)}`).toBe(links)
    }
  })

  it('contains no em dashes anywhere in its content', () => {
    expect(JSON.stringify(article).includes(EM_DASH)).toBe(false)
  })

  it('closes with the house CTA pair: one to /scan, one to /how-it-works', () => {
    const ctas = article.blocks.filter((b) => b.type === 'cta')
    const hrefs = ctas.map((c) => (c.type === 'cta' ? c.href : ''))
    expect(hrefs).toContain('/scan')
    expect(hrefs).toContain('/how-it-works')
    // The closing CTA is the one that converts; it belongs last.
    expect(article.blocks[article.blocks.length - 1]?.type).toBe('cta')
  })

  it('ships enough FAQs to emit useful FAQPage schema, with substantive answers', () => {
    expect(article.faqs.length).toBeGreaterThanOrEqual(5)
    for (const faq of article.faqs) {
      expect(faq.question.length, faq.question).toBeGreaterThan(10)
      expect(faq.answer.length, faq.question).toBeGreaterThan(60)
    }
    const questions = article.faqs.map((f) => f.question)
    // The renderer keys FAQs by question text, so duplicates collapse silently.
    expect(new Set(questions).size).toBe(questions.length)
  })

  it('opens with prose or a notice, never a heading (answer-first house style)', () => {
    // A leading callout is the deliberate correction-notice pattern used by the
    // articles rewritten after ChatGPT Instant Checkout was retired. A leading
    // h2 is the thing to prevent: it means the piece buried its answer.
    expect(['p', 'callout']).toContain(article.blocks[0]?.type)
  })

  it('declares a plausible read time and a non-empty dek', () => {
    expect(article.readMinutes).toBeGreaterThan(0)
    expect(article.readMinutes).toBeLessThanOrEqual(30)
    expect(article.dek.length).toBeGreaterThan(40)
  })
})
