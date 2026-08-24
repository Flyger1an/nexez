import type { CommerceActionRecord } from './commerce-actions'

export type CommerceAttentionStatus = 'complete' | 'partial' | 'unavailable'

export type CommerceAttentionSummary = {
  visibleCount: number
  urgentCount: number
  isTruncated: boolean
  status: CommerceAttentionStatus
  href: string
}

type CommerceAttentionSource = {
  actions: CommerceActionRecord[]
  urgentCount: number
  isTruncated: boolean
  issues: string[]
}

export const unavailableCommerceAttention: CommerceAttentionSummary = {
  visibleCount: 0,
  urgentCount: 0,
  isTruncated: false,
  status: 'unavailable',
  href: '/dashboard/commerce',
}

export function buildCommerceAttentionSummary(
  source: CommerceAttentionSource,
): CommerceAttentionSummary {
  const status: CommerceAttentionStatus = source.issues.length
    ? source.actions.length ? 'partial' : 'unavailable'
    : source.isTruncated ? 'partial' : 'complete'
  const exactSingleAction = status === 'complete'
    && !source.isTruncated
    && source.actions.length === 1

  return {
    visibleCount: source.actions.length,
    urgentCount: source.urgentCount,
    isTruncated: source.isTruncated,
    status,
    href: exactSingleAction
      ? source.actions[0].record.href
      : '/dashboard/commerce',
  }
}

export function commerceAttentionIsIncomplete(summary: CommerceAttentionSummary) {
  return summary.status !== 'complete' || summary.isTruncated
}

export function commerceAttentionBadgeLabel(summary: CommerceAttentionSummary) {
  if (summary.status === 'unavailable') return 'Commerce actions unavailable'
  if (!summary.visibleCount && commerceAttentionIsIncomplete(summary)) {
    return 'Commerce action coverage incomplete'
  }
  const qualifier = commerceAttentionIsIncomplete(summary) ? ' or more' : ''
  const urgent = summary.urgentCount
    ? `, ${summary.urgentCount} urgent`
    : ''
  return `${summary.visibleCount}${qualifier} commerce action${summary.visibleCount === 1 && !qualifier ? '' : 's'}${urgent}`
}
