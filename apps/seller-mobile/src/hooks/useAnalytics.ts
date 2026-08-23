import { getAnalyticsRollup, getMyPlanEntitlements } from '@/src/lib/data'
import { loadMobileAnalytics } from '@/src/lib/plan-aware-analytics'
import { useAsyncData } from './useAsyncData'
import { useSession } from './useSession'

export function useAnalytics(rangeDays: number | null) {
  const { user } = useSession()
  return useAsyncData(async () => {
    if (!user) throw new Error('Sign in required.')
    return loadMobileAnalytics(user.id, rangeDays, {
      getEntitlements: getMyPlanEntitlements,
      getRollup: getAnalyticsRollup,
    })
  }, [user?.id, rangeDays])
}
