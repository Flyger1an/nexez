import { useCallback } from 'react'
import { getAnalyticsRollup, getMyPlanEntitlements } from '@/src/lib/data'
import { loadMobileAnalytics } from '@/src/lib/plan-aware-analytics'
import { useAsyncData } from './useAsyncData'
import { useSession } from './useSession'

export function useAnalytics(rangeDays: number | null) {
  const { user } = useSession()
  const ownerId = user?.id
  const load = useCallback(async () => {
    if (!ownerId) throw new Error('Sign in required.')
    return loadMobileAnalytics(ownerId, rangeDays, {
      getEntitlements: getMyPlanEntitlements,
      getRollup: getAnalyticsRollup,
    })
  }, [ownerId, rangeDays])
  return useAsyncData(load)
}
