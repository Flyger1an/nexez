import { useCallback } from 'react'
import { getBillingSubscription, getFinanceRollup, getMyPlanEntitlements, getSellerPages } from '@/src/lib/data'
import { getOfferCount } from '@/src/lib/agent-page'
import { useAsyncData } from './useAsyncData'
import { useSession } from './useSession'

export function useBilling() {
  const { user } = useSession()
  const ownerId = user?.id
  const load = useCallback(async () => {
    if (!ownerId) throw new Error('Sign in required.')
    const billingPromise = getBillingSubscription(ownerId)
    const pagesPromise = getSellerPages(ownerId)
    const entitlements = await getMyPlanEntitlements(ownerId)
    const [billing, pages, finance] = await Promise.all([
      billingPromise,
      pagesPromise,
      getFinanceRollup(new Date(Date.now() - 30 * 86400000), entitlements.commissionBps),
    ])
    const planId = entitlements.featurePlanId
    const commissionPercent = entitlements.commissionBps / 100
    const primaryCurrency = finance.currencies[0]
    const agentRevenueCents = primaryCurrency?.grossCents ?? 0

    return {
      billing,
      entitlements,
      planId,
      status: billing?.status ?? 'unconfigured',
      pageCount: pages.length,
      publishedCount: pages.filter((page) => page.is_published).length,
      offerCount: pages.reduce((sum, page) => sum + getOfferCount(page), 0),
      agentRevenueCents,
      financeCurrency: primaryCurrency?.currency ?? 'usd',
      commissionPercent,
      platformFeesCents: primaryCurrency?.feeCents ?? 0,
    }
  }, [ownerId])
  return useAsyncData(load)
}
