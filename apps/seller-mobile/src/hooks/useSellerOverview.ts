import { useCallback } from 'react'
import { getOverviewMetrics } from '@/src/lib/data'
import { useAsyncData } from './useAsyncData'
import { useSession } from './useSession'

export function useSellerOverview() {
  const { user } = useSession()
  const ownerId = user?.id
  const load = useCallback(
    () => (ownerId ? getOverviewMetrics(ownerId) : Promise.reject(new Error('Sign in required.'))),
    [ownerId],
  )
  return useAsyncData(load)
}
