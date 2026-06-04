import { AgentPage, OfferKind } from '../agent-page'
import { servedVariants } from '../ab-testing'
import { logCheckoutEvent } from './log-checkout-event'

// Record one `ab_impression` per served A/B variant for a public page view.
// Runs in `after()` so it never adds latency to the page render. The offer's
// own ab_test/ab_label are auto-merged into metadata by logCheckoutEvent.
export async function logAbImpressions({ page, bucket }: { page: AgentPage; bucket: number }) {
  const kinds: OfferKind[] = ['services', 'products']
  for (const kind of kinds) {
    const offers = (kind === 'services' ? page.services : page.products) ?? []
    for (const { index } of servedVariants(offers, bucket)) {
      const offer = offers[index]
      if (!offer) continue
      await logCheckoutEvent({
        page,
        offer: { ...offer, kind, index },
        eventType: 'ab_impression',
        metadata: { source: 'public_agent_page' },
      })
    }
  }
}
