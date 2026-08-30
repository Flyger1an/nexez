import type { AgentPage } from '@/src/types/nexez'
import { getOfferCount, getReadinessScore } from './agent-page'

export type PortfolioReadinessRow = {
  id: string
  name: string
  score: number
  offerCount: number
  relation: 'selected' | 'higher' | 'same' | 'lower'
}

export type PortfolioReadinessComparison = {
  selectedScore: number
  rows: PortfolioReadinessRow[]
}

/**
 * Compare only the listings supplied by the owner-scoped mobile query. This is
 * intentionally not a market or competitor ranking.
 */
export function buildPortfolioReadinessComparison(
  pages: AgentPage[],
  selectedId: string | null | undefined,
): PortfolioReadinessComparison | null {
  const selected = pages.find((page) => page.id === selectedId)
  if (!selected) return null

  const selectedScore = getReadinessScore(selected)
  const rows = pages
    .map((page, index) => {
      const score = getReadinessScore(page)
      return {
        id: page.id,
        name: page.name,
        score,
        offerCount: getOfferCount(page),
        relation: page.id === selected.id
          ? 'selected' as const
          : score > selectedScore
            ? 'higher' as const
            : score < selectedScore
              ? 'lower' as const
              : 'same' as const,
        index,
      }
    })
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ index: _index, ...row }) => row)

  return { selectedScore, rows }
}
