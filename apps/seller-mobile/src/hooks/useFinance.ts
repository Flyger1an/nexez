import { useCallback } from 'react'
import { getFinanceRollup, getMyPlanEntitlements } from '@/src/lib/data'
import { useAsyncData } from './useAsyncData'
import { useSession } from './useSession'

export function useFinance() {
  const { user } = useSession()
  const ownerId = user?.id
  const load = useCallback(async () => {
    if (!ownerId) throw new Error('Sign in required.')

    const entitlements = await getMyPlanEntitlements(ownerId)
    return getFinanceRollup(new Date(Date.now() - 30 * 86400000), entitlements.commissionBps)
  }, [ownerId])
  return useAsyncData(load)
}
