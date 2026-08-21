import { getAnalyticsRollup } from '@/src/lib/data'
import { useAsyncData } from './useAsyncData'
import { useSession } from './useSession'

export function useAnalytics(rangeDays: number) {
  const { user } = useSession()
  return useAsyncData(async () => {
    if (!user) throw new Error('Sign in required.')
    const cutoff = new Date(Date.now() - rangeDays * 86400000)
    return { rollup: await getAnalyticsRollup(cutoff) }
  }, [user?.id, rangeDays])
}
