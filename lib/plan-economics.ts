import { BASIS_POINTS_PER_WHOLE, getBillingPlan, getCommissionBpsForPlan, type PlanId } from './billing'

export type PlanEconomics = {
  subscriptionCents: number
  commissionBps: number
}

/** Monthly Nexez cost only: subscription + Nexez-settled transaction commission. */
export function monthlyNexezCost(gmvCents: number, economics: PlanEconomics): number {
  const gmv = Number.isFinite(gmvCents) ? Math.max(0, Math.round(gmvCents)) : 0
  const subscription = Number.isFinite(economics.subscriptionCents)
    ? Math.max(0, Math.round(economics.subscriptionCents))
    : 0
  const bps = Number.isFinite(economics.commissionBps)
    ? Math.max(0, Math.round(economics.commissionBps))
    : 0
  return subscription + Math.round((gmv * bps) / BASIS_POINTS_PER_WHOLE)
}

/** First whole cent of monthly GMV where the higher-subscription/lower-fee plan
 * is no more expensive than the lower plan. Null means it never breaks even. */
export function planBreakevenGmv(lower: PlanEconomics, higher: PlanEconomics): number | null {
  const rateSavingsBps = Math.round(lower.commissionBps) - Math.round(higher.commissionBps)
  if (rateSavingsBps <= 0) return null
  const extraSubscriptionCents = Math.round(higher.subscriptionCents) - Math.round(lower.subscriptionCents)
  if (extraSubscriptionCents <= 0) return 0
  return Math.ceil((extraSubscriptionCents * BASIS_POINTS_PER_WHOLE) / rateSavingsBps)
}

/** Catalog economics for self-serve plans. Enterprise subscription pricing is
 * negotiated, so callers must not invent a comparable monthly cost for it. */
export function getPlanEconomics(planId: PlanId, commissionBps = getCommissionBpsForPlan(planId)): PlanEconomics | null {
  const plan = getBillingPlan(planId)
  if (!plan || plan.monthlyPriceCents == null) return null
  return { subscriptionCents: plan.monthlyPriceCents, commissionBps }
}
