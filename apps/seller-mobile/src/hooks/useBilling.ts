import { getBillingSubscription, getFinanceRollup, getMyPlanEntitlements, getSellerPages } from '@/src/lib/data'
import { getOfferCount } from '@/src/lib/agent-page'
import { useAsyncData } from './useAsyncData'
import { useSession } from './useSession'

export function useBilling() {
  const { user } = useSession()
  return useAsyncData(async () => {
    if (!user) throw new Error('Sign in required.')
    const billingPromise = getBillingSubscription(user.id)
    const pagesPromise = getSellerPages(user.id)
    const entitlements = await getMyPlanEntitlements(user.id)
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
  }, [user?.id])
}
