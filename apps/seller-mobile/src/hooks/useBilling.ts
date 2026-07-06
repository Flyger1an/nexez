import { getBillingSubscription, getCheckoutEvents, getSellerPages } from '@/src/lib/data'
import { getOfferCount } from '@/src/lib/agent-page'
import { useAsyncData } from './useAsyncData'
import { useSession } from './useSession'

export function useBilling() {
  const { user } = useSession()
  return useAsyncData(async () => {
    if (!user) throw new Error('Sign in required.')
    const [billing, pages, events] = await Promise.all([
      getBillingSubscription(user.id),
      getSellerPages(user.id),
      getCheckoutEvents(user.id, 500),
    ])
    const planId = billing?.plan_id ?? 'free'
    const agentRevenueCents = events
      .filter((event) => event.event_type === 'stripe_session_created' && event.metadata?.dry_run !== true)
      .reduce((sum, event) => {
        const raw = event.metadata?.amount_cents
        return sum + (typeof raw === 'number' ? raw : Number(raw || 0))
      }, 0)
    const commissionPercent = billing?.commission_percent ?? 15

    return {
      billing,
      planId,
      status: billing?.status ?? 'unconfigured',
      pageCount: pages.length,
      publishedCount: pages.filter((page) => page.is_published).length,
      offerCount: pages.reduce((sum, page) => sum + getOfferCount(page), 0),
      agentRevenueCents,
      commissionPercent,
      platformFeesCents: Math.round(agentRevenueCents * (commissionPercent / 100)),
    }
  }, [user?.id])
}
