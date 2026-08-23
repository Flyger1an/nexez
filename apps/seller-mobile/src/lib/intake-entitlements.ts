import type { OwnerPlanEntitlements } from '@/src/types/nexez'
import type { IntakeGap, IntakeGapAnswer } from '@/src/types/intake'
import { isCurrentMobileEntitlementSnapshot } from './entitlement-snapshot'

/** Treat only a self-consistent, owner-bound RPC snapshot as an unlock. */
export function mobileIntakeNegotiationAllowed(
  value: unknown,
  ownerId: string | null | undefined,
  now: Date = new Date(),
): value is OwnerPlanEntitlements {
  return isCurrentMobileEntitlementSnapshot(value, ownerId, now)
    && value.featurePlanRank >= 2
    && value.features.negotiation === true
}

export type MobileIntakeQuickAnswer = {
  label: string
  answer: IntakeGapAnswer
  locked?: boolean
}

/** Shared pure projection so the rendered chips and regression tests cannot drift. */
export function buildMobileIntakeQuickAnswers(
  gap: IntakeGap,
  negotiationAllowed: boolean,
): MobileIntakeQuickAnswer[] {
  const answers: MobileIntakeQuickAnswer[] = []
  if (gap.field === 'offerType' && gap.offerKey) {
    answers.push(
      {
        label: 'Fixed price',
        answer: {
          gapId: gap.id,
          answer: 'Fixed price',
          fields: [{ target: 'offer', offerKey: gap.offerKey, field: 'offerType', value: 'fixed' }],
        },
      },
      {
        label: 'Open to offers',
        locked: !negotiationAllowed,
        answer: {
          gapId: gap.id,
          answer: 'Open to offers',
          fields: [{ target: 'offer', offerKey: gap.offerKey, field: 'offerType', value: 'negotiable' }],
        },
      },
    )
  }
  answers.push({ label: 'Skip', answer: { gapId: gap.id, answer: 'skip', skipped: true } })
  return answers
}
