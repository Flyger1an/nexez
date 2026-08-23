import { useCallback } from 'react'
import { getBuyerRequests, getNegotiations, getOrders, getReviews } from '@/src/lib/data'
import { useAsyncData } from './useAsyncData'
import { useSession } from './useSession'

export function useInbox() {
  const { user } = useSession()
  const ownerId = user?.id
  const load = useCallback(async () => {
    if (!ownerId) throw new Error('Sign in required.')
    const [negotiations, orders, reviews, requests] = await Promise.all([
      getNegotiations(ownerId),
      getOrders(ownerId),
      getReviews(ownerId),
      getBuyerRequests(ownerId),
    ])
    return { negotiations, orders, reviews, requests }
  }, [ownerId])
  return useAsyncData(load)
}
