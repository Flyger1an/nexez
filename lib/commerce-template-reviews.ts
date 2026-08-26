import type {
  CommerceTemplateOpportunityAction,
  CommerceTemplateOpportunityRow,
} from './commerce-template-opportunities'

export const COMMERCE_TEMPLATE_REVIEW_REASONS = [
  'performance',
  'catalog_overlap',
  'replacement',
  'manual',
] as const

export const COMMERCE_TEMPLATE_REVIEW_DECISIONS = [
  'keep',
  'revise',
  'recommend_retirement',
] as const

export type CommerceTemplateReviewReason = typeof COMMERCE_TEMPLATE_REVIEW_REASONS[number]
export type CommerceTemplateReviewDecision = typeof COMMERCE_TEMPLATE_REVIEW_DECISIONS[number]
export type CommerceTemplateReviewEventType = 'opened' | 'decided'

export type CommerceTemplateReviewEvidence = {
  schemaVersion: 1
  generatedAt: string
  template: {
    id: string
    version: number
    title: string
  }
  recommendation: {
    action: CommerceTemplateOpportunityAction
    label: string
    reason: string
    performanceReviewReady: boolean
  }
  sources: {
    demand: boolean
    demandTruncated: boolean
    supply: boolean
    listings: boolean
    benchmark: boolean
    checkout: boolean
    negotiated: boolean
  }
  demand: CommerceTemplateOpportunityRow['demand']
  supply: CommerceTemplateOpportunityRow['supply']
  adoption: CommerceTemplateOpportunityRow['adoption']
  checkout: CommerceTemplateOpportunityRow['checkout']
  negotiated: CommerceTemplateOpportunityRow['negotiated']
}

export type CommerceTemplateReviewEvent = {
  id: string
  reviewId: string
  templateId: string
  templateVersion: number
  reviewReason: CommerceTemplateReviewReason
  eventType: CommerceTemplateReviewEventType
  decision: CommerceTemplateReviewDecision | null
  rationale: string
  snapshotGeneratedAt: string
  evidence: CommerceTemplateReviewEvidence
  createdAt: string
}

export type CommerceTemplateReviewCase = {
  reviewId: string
  templateId: string
  templateVersion: number
  reviewReason: CommerceTemplateReviewReason
  opened: CommerceTemplateReviewEvent
  decision: CommerceTemplateReviewEvent | null
  status: 'open' | 'decided'
}

export type CommerceTemplateReviewReport = {
  available: boolean
  truncated: boolean
  cases: CommerceTemplateReviewCase[]
}

export function buildCommerceTemplateReviewEvidence(input: {
  generatedAt: string
  sources: CommerceTemplateReviewEvidence['sources']
  row: CommerceTemplateOpportunityRow
}): CommerceTemplateReviewEvidence {
  const { row } = input
  return {
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    template: {
      id: row.templateId,
      version: row.templateVersion,
      title: row.title,
    },
    recommendation: {
      action: row.action,
      label: row.actionLabel,
      reason: row.reason,
      performanceReviewReady: row.action === 'review-template',
    },
    sources: { ...input.sources },
    demand: structuredClone(row.demand),
    supply: structuredClone(row.supply),
    adoption: structuredClone(row.adoption),
    checkout: structuredClone(row.checkout),
    negotiated: structuredClone(row.negotiated),
  }
}

export function groupCommerceTemplateReviewEvents(
  events: CommerceTemplateReviewEvent[],
): CommerceTemplateReviewCase[] {
  const byReview = new Map<string, CommerceTemplateReviewEvent[]>()
  for (const event of events) {
    const group = byReview.get(event.reviewId) ?? []
    group.push(event)
    byReview.set(event.reviewId, group)
  }

  return [...byReview.values()]
    .flatMap((group) => {
      const opened = group.find((event) => event.eventType === 'opened')
      if (!opened) return []
      const decision = group.find((event) => event.eventType === 'decided') ?? null
      return [{
        reviewId: opened.reviewId,
        templateId: opened.templateId,
        templateVersion: opened.templateVersion,
        reviewReason: opened.reviewReason,
        opened,
        decision,
        status: decision ? 'decided' : 'open',
      } satisfies CommerceTemplateReviewCase]
    })
    .sort((left, right) => right.opened.createdAt.localeCompare(left.opened.createdAt))
}

export function commerceTemplateReviewReasonLabel(reason: CommerceTemplateReviewReason): string {
  if (reason === 'performance') return 'Results need review'
  if (reason === 'catalog_overlap') return 'Guide overlap'
  if (reason === 'replacement') return 'Possible replacement'
  return 'Operator review'
}

export function commerceTemplateReviewDecisionLabel(decision: CommerceTemplateReviewDecision): string {
  if (decision === 'keep') return 'Keep guide'
  if (decision === 'revise') return 'Revise guide'
  return 'Recommend retirement'
}

export function isCommerceTemplateReviewReason(value: string): value is CommerceTemplateReviewReason {
  return COMMERCE_TEMPLATE_REVIEW_REASONS.includes(value as CommerceTemplateReviewReason)
}

export function isCommerceTemplateReviewDecision(value: string): value is CommerceTemplateReviewDecision {
  return COMMERCE_TEMPLATE_REVIEW_DECISIONS.includes(value as CommerceTemplateReviewDecision)
}
