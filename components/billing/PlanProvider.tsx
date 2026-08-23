'use client'

import { createContext, useContext, type ReactNode } from 'react'
import {
  getPlanFeatureEntitlements,
  getSerializablePlanLimits,
  type PlanFeature,
  type PlanId,
  type SerializablePlanLimits,
} from '../../lib/billing'

// The viewer's effective plan, resolved server-side in app/dashboard/layout.tsx and
// provided here so any client dashboard component can gate features without its own
// fetch (and with no first-paint flash). Server components read getOwnerPlanId() directly.
export type DashboardEntitlements = {
  planId: PlanId
  features: Record<PlanFeature, boolean>
  limits: SerializablePlanLimits
}

const FREE_ENTITLEMENTS: DashboardEntitlements = {
  planId: 'free',
  features: getPlanFeatureEntitlements('free'),
  limits: getSerializablePlanLimits('free'),
}

const PlanContext = createContext<DashboardEntitlements>(FREE_ENTITLEMENTS)

export function PlanProvider({ entitlements, children }: { entitlements: DashboardEntitlements; children: ReactNode }) {
  return <PlanContext.Provider value={entitlements}>{children}</PlanContext.Provider>
}

/** Current viewer's plan id inside the dashboard (defaults to 'free'). */
export function usePlan(): PlanId {
  return useContext(PlanContext).planId
}

/** Complete viewer entitlement snapshot resolved before the dashboard renders. */
export function usePlanEntitlements(): DashboardEntitlements {
  return useContext(PlanContext)
}
