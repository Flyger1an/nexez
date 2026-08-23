import { getFinanceRollup, getMyPlanEntitlements } from '@/src/lib/data'
import { useAsyncData } from './useAsyncData'
import { useSession } from './useSession'

export function useFinance() {
  const { user } = useSession()
  return useAsyncData(async () => {
    if (!user) throw new Error('Sign in required.')

    const entitlements = await getMyPlanEntitlements(user.id)
    return getFinanceRollup(new Date(Date.now() - 30 * 86400000), entitlements.commissionBps)
  }, [user?.id])
}
