import { useCallback } from 'react'
import { getAgentVisits, getCheckoutEvents, getSellerPage, getSellerPages, pageSignals } from '@/src/lib/data'
import type { AgentPage } from '@/src/types/nexez'
import { useAsyncData } from './useAsyncData'
import { useSession } from './useSession'

export function useListings() {
  const { user } = useSession()
  const ownerId = user?.id
  const load = useCallback(
    () => (ownerId ? getSellerPages(ownerId) : Promise.reject(new Error('Sign in required.'))),
    [ownerId],
  )
  return useAsyncData(load)
}

// Listings + a pageId → agent-visit-count map (the board card shows per-listing visits).
export function useListingsBoard() {
  const { user } = useSession()
  const ownerId = user?.id
  const load = useCallback(async () => {
    if (!ownerId) throw new Error('Sign in required.')
    const [pages, visits] = await Promise.all([getSellerPages(ownerId), getAgentVisits(ownerId)])
    const visitsByPage = new Map<string, number>()
    for (const v of visits) {
      if (!v.is_ai_agent) continue
      visitsByPage.set(v.page_id, (visitsByPage.get(v.page_id) ?? 0) + 1)
    }
    return { pages, visitsByPage }
  }, [ownerId])
  return useAsyncData(load)
}

export function useListing(id?: string | string[]) {
  const listingId = Array.isArray(id) ? id[0] : id
  const load = useCallback(() => (listingId ? getSellerPage(listingId) : Promise.resolve(null)), [listingId])
  return useAsyncData(load)
}

export function useListingSignals(page: AgentPage | null | undefined) {
  const { user } = useSession()
  const ownerId = user?.id
  const load = useCallback(async () => {
    if (!ownerId || !page) return null
    const [visits, events] = await Promise.all([getAgentVisits(ownerId), getCheckoutEvents(ownerId)])
    return pageSignals(page, visits, events)
  }, [ownerId, page])
  return useAsyncData(load)
}
