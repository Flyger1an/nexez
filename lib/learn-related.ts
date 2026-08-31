import { cardSummaryOf, getLearnArticle, learnArticles, type LearnArticle } from './learn-content'

// Related reading, computed rather than curated.
//
// The articles already cross-reference each other heavily in prose, and that
// link graph was sitting in the data unused. Deriving from it means a new
// article joins the graph the moment it ships and a hand-maintained list can
// never go stale. Scoring, highest first:
//
//   3  this article links to it, AND it links back    (a genuine pair)
//   2  this article links to it                       (the author said so)
//   2  it links to this article                       (inbound, equally real)
//   1  same category                                  (the fallback that guarantees a floor)

const LEARN_LINK = /\]\(\/learn\/([a-z0-9-]+)\)/g

/** Slugs this article links to in its own prose. */
export function outboundSlugs(article: LearnArticle): string[] {
  const found = new Set<string>()
  const text = JSON.stringify({ blocks: article.blocks, faqs: article.faqs })
  for (const m of text.matchAll(LEARN_LINK)) {
    if (m[1] && m[1] !== article.slug) found.add(m[1])
  }
  return [...found]
}

export type RelatedArticle = {
  slug: string
  title: string
  category: LearnArticle['category']
  readMinutes: number
  summary: string
}

export function relatedArticles(article: LearnArticle, limit = 3): RelatedArticle[] {
  const score = new Map<string, number>()
  const bump = (slug: string, by: number) => {
    if (slug === article.slug) return
    score.set(slug, (score.get(slug) ?? 0) + by)
  }

  const out = new Set(outboundSlugs(article))
  for (const slug of out) bump(slug, 2)

  for (const other of learnArticles) {
    if (other.slug === article.slug) continue
    if (outboundSlugs(other).includes(article.slug)) {
      bump(other.slug, out.has(other.slug) ? 1 : 2)
    }
    if (other.category === article.category) bump(other.slug, 1)
  }

  return [...score.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([slug]) => getLearnArticle(slug))
    .filter((a): a is LearnArticle => Boolean(a))
    .slice(0, limit)
    .map((a) => ({
      slug: a.slug,
      title: a.title,
      category: a.category,
      readMinutes: a.readMinutes,
      summary: cardSummaryOf(a),
    }))
}
