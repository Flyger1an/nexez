import type { LearnArticle } from './learn-content'

// Heading ids for /learn articles.
//
// Every article runs 5 to 8 h2 sections and until now emitted none of them with
// an id, so no section could be linked to, cited by fragment, or listed in a
// contents rail. The slug has to be STABLE (it becomes a public URL fragment the
// moment anyone shares one) and UNIQUE within a page (two entries pointing at the
// same anchor is a silently broken contents list), which is why de-duplication
// happens once for the whole article rather than per block.

export type ArticleHeading = {
  id: string
  text: string
  level: 2 | 3
}

/** Lowercase, alphanumerics and hyphens only. Deliberately boring, because it is a URL. */
export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '')
}

/**
 * Every h2 and h3 in document order, with collision-suffixed ids.
 *
 * The renderer and the contents list both call this and index into the same
 * result, so the ids on the page and the ids in the nav cannot drift apart.
 */
export function headingsOf(article: LearnArticle): ArticleHeading[] {
  const seen = new Map<string, number>()
  const out: ArticleHeading[] = []
  for (const block of article.blocks) {
    if (block.type !== 'h2' && block.type !== 'h3') continue
    const base = slugifyHeading(block.text) || 'section'
    const n = seen.get(base) ?? 0
    seen.set(base, n + 1)
    out.push({
      id: n === 0 ? base : `${base}-${n + 1}`,
      text: block.text,
      level: block.type === 'h2' ? 2 : 3,
    })
  }
  return out
}

/** Top-level sections only. What the contents rail shows; h3s would make it a wall. */
export function tocOf(article: LearnArticle): ArticleHeading[] {
  return headingsOf(article).filter((h) => h.level === 2)
}
