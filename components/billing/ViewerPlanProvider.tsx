import 'server-only'

import { cookies } from 'next/headers'
import type { ReactNode } from 'react'
import { getPlanFeatureEntitlements, getSerializablePlanLimits } from '../../lib/billing'
import { getOwnerEntitlements } from '../../lib/server/plan'
import { createClient } from '../../utils/supabase/server'
import { PlanProvider, type DashboardEntitlements } from './PlanProvider'

const FREE_ENTITLEMENTS: DashboardEntitlements = {
  planId: 'free',
  features: getPlanFeatureEntitlements('free'),
  limits: getSerializablePlanLimits('free'),
}

/**
 * Resolves an optional viewer's plan before rendering a public, plan-aware tool.
 * Anonymous visitors and transient auth/entitlement failures fail closed to Free.
 */
export async function ViewerPlanProvider({ children }: { children: ReactNode }) {
  let entitlements = FREE_ENTITLEMENTS

  try {
    const cookieStore = await cookies()
    const supabase = createClient(cookieStore)
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (user) {
      const resolved = await getOwnerEntitlements(supabase, user.id)
      entitlements = {
        planId: resolved.planId,
        features: resolved.features,
        limits: resolved.limits,
      }
    }
  } catch {
    // Public routes must remain available during an auth/billing read failure,
    // but paid controls stay unavailable until access can be verified.
  }

  return <PlanProvider entitlements={entitlements}>{children}</PlanProvider>
}
