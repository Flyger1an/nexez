'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { PlanId } from '../../lib/billing'

// The viewer's effective plan, resolved server-side in app/dashboard/layout.tsx and
// provided here so any client dashboard component can gate features without its own
// fetch (and with no first-paint flash). Server components read getOwnerPlanId() directly.
const PlanContext = createContext<PlanId>('free')

export function PlanProvider({ plan, children }: { plan: PlanId; children: ReactNode }) {
  return <PlanContext.Provider value={plan}>{children}</PlanContext.Provider>
}

/** Current viewer's plan id inside the dashboard (defaults to 'free'). */
export function usePlan(): PlanId {
  return useContext(PlanContext)
}
