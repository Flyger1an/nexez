import { getAgentVisits, getCheckoutEvents, getSellerPage, getSellerPages, pageSignals } from '@/src/lib/data'
import type { AgentPage } from '@/src/types/nexez'
import { useAsyncData } from './useAsyncData'
import { useSession } from './useSession'

export function useListings() {
  const { user } = useSession()
  return useAsyncData(() => (user ? getSellerPages(user.id) : Promise.reject(new Error('Sign in required.'))), [user?.id])
}

// Listings + a pageId → agent-visit-count map (the board card shows per-listing visits).
export function useListingsBoard() {
  const { user } = useSession()
  return useAsyncData(async () => {
    if (!user) throw new Error('Sign in required.')
    const [pages, visits] = await Promise.all([getSellerPages(user.id), getAgentVisits(user.id)])
    const visitsByPage = new Map<string, number>()
    for (const v of visits) {
      if (!v.is_ai_agent) continue
      visitsByPage.set(v.page_id, (visitsByPage.get(v.page_id) ?? 0) + 1)
    }
    return { pages, visitsByPage }
  }, [user?.id])
}

export function useListing(id?: string | string[]) {
  const listingId = Array.isArray(id) ? id[0] : id
  return useAsyncData(() => (listingId ? getSellerPage(listingId) : Promise.resolve(null)), [listingId])
}

export function useListingSignals(page: AgentPage | null | undefined) {
  const { user } = useSession()
  return useAsyncData(async () => {
    if (!user || !page) return null
    const [visits, events] = await Promise.all([getAgentVisits(user.id), getCheckoutEvents(user.id)])
    return pageSignals(page, visits, events)
  }, [user?.id, page?.id])
}
