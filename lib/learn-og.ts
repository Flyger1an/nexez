import type { LearnArticle } from './learn-content'

// The shared marketing OG card renders exactly two display lines at fixed 78px
// and 70px type. Article metaTitles are one string, so they have to be split,
// and a bad split is very visible (a line reading just "A", or a second line
// wide enough to clip). This module owns that split so it can be unit-tested
// without rendering an image.

/** Max characters per display line before the shared card starts to clip. */
export const OG_LINE_MAX = 32

/** Both halves must fit comfortably for a punctuation split to be preferred. */
const PUNCTUATION_SPLIT_MAX = 30

const toneForCategory: Record<LearnArticle['category'], 'signal' | 'ready' | 'amber'> = {
  'Agentic commerce': 'signal',
  'Agent readiness': 'ready',
  Guides: 'amber',
}

export function ogToneForCategory(category: LearnArticle['category']): 'signal' | 'ready' | 'amber' {
  return toneForCategory[category]
}

function clip(line: string): string {
  return line.length > OG_LINE_MAX ? `${line.slice(0, OG_LINE_MAX - 1).trimEnd()}…` : line
}

/**
 * Split a metaTitle into the card's two display lines.
 *
 * Prefers the author's own break (a colon or a mid-string question mark), since
 * "What Is an MCP Server?" / "A Business Owner's Guide" reads far better than the
 * balanced-midpoint split, which strands the article's "A" at the end of line one.
 * Falls back to the word boundary nearest the midpoint when no punctuation break
 * exists or when using it would leave one half too long to fit.
 */
export function splitOgTitle(metaTitle: string): { title: string; accent: string } {
  const text = metaTitle.trim()

  // Last break that is not the final character; a trailing "?" is the whole
  // title's punctuation, not a divider.
  let breakAt = -1
  for (let i = 0; i < text.length - 1; i++) {
    const ch = text[i]
    if ((ch === ':' || ch === '?') && text[i + 1] === ' ') breakAt = i
  }

  if (breakAt > 0) {
    const head = text.slice(0, breakAt + 1).trim()
    const tail = text.slice(breakAt + 1).trim()
    if (head.length <= PUNCTUATION_SPLIT_MAX && tail.length <= PUNCTUATION_SPLIT_MAX && tail.length > 0) {
      return { title: clip(head), accent: clip(tail) }
    }
  }

  const words = text.split(' ')
  if (words.length < 2) return { title: clip(text), accent: '' }

  let best: [string, string] = [words[0]!, words.slice(1).join(' ')]
  let bestDelta = Infinity
  for (let i = 1; i < words.length; i++) {
    const head = words.slice(0, i).join(' ')
    const tail = words.slice(i).join(' ')
    const delta = Math.abs(head.length - tail.length)
    if (delta < bestDelta) {
      bestDelta = delta
      best = [head, tail]
    }
  }
  return { title: clip(best[0]), accent: clip(best[1]) }
}

/** Eyebrow line: category plus read time, which is the useful metadata on a share card. */
export function ogEyebrow(article: Pick<LearnArticle, 'category' | 'readMinutes'>): string {
  return `${article.category} · ${article.readMinutes} min read`
}
