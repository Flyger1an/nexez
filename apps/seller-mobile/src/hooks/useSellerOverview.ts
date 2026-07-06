import { getOverviewMetrics } from '@/src/lib/data'
import { useAsyncData } from './useAsyncData'
import { useSession } from './useSession'

export function useSellerOverview() {
  const { user } = useSession()
  return useAsyncData(() => (user ? getOverviewMetrics(user.id) : Promise.reject(new Error('Sign in required.'))), [user?.id])
}
