import { getBuyerRequests, getNegotiations, getOrders, getReviews } from '@/src/lib/data'
import { useAsyncData } from './useAsyncData'
import { useSession } from './useSession'

export function useInbox() {
  const { user } = useSession()
  return useAsyncData(async () => {
    if (!user) throw new Error('Sign in required.')
    const [negotiations, orders, reviews, requests] = await Promise.all([
      getNegotiations(user.id),
      getOrders(user.id),
      getReviews(user.id),
      getBuyerRequests(user.id),
    ])
    return { negotiations, orders, reviews, requests }
  }, [user?.id])
}
