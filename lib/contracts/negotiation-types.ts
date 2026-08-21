export const OWNER_DECISION_ACTIONS = [
  'accept',
  'counter',
  'reject',
  'clarify',
  'pause',
  'resume',
] as const

type OwnerDecisionBase = {
  reasoning: string
  internalNotes?: string
}

export type OwnerNegotiationDecision =
  | (OwnerDecisionBase & {
      action: 'accept'
      amountCents?: number
    })
  | (OwnerDecisionBase & {
      action: 'counter'
      counter: {
        priceCents: number
        proposedDate?: string
        scopeNotes?: string
      }
    })
  | (OwnerDecisionBase & {
      action: 'reject'
    })
  | (OwnerDecisionBase & {
      action: 'clarify'
      clarificationQuestions?: string[]
    })
  | (OwnerDecisionBase & {
      action: 'pause'
    })
  | (OwnerDecisionBase & {
      action: 'resume'
    })

export type OwnerDecisionRequest = {
  negotiationId: string
  decision: OwnerNegotiationDecision
}
