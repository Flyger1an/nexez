import { createNexezClient, type AgentPageManifest, type NexezSearchResult } from '@nexez/agent-sdk'

const nexez = createNexezClient({ buyerAgent: 'nexez-location-shortlist-example' })

const buyerIntent = process.env.NEXEZ_BUYER_INTENT ?? 'find a remote AI workflow consultant under 3000'
const buyerLocation = process.env.NEXEZ_BUYER_LOCATION ?? 'Chicago, IL'
const buyerBudget = process.env.NEXEZ_BUYER_BUDGET ?? 'USD 2500'

const matches = await nexez.search(buyerIntent, {
  location: buyerLocation,
  limit: 8,
})

const candidates = await Promise.all(
  matches.results.slice(0, 5).map(async (result) => {
    const manifest = await nexez.getAgentPage(result.page.slug)
    const offerKey = result.offer?.key ?? manifest.offers[0]?.key ?? 'services-0'
    const offer = manifest.offers.find((item) => item.key === offerKey) ?? manifest.offers[0]

    return {
      result,
      manifest,
      offer,
      score: scoreCandidate(result, manifest),
    }
  }),
)

const shortlist = candidates
  .filter((candidate) => candidate.offer)
  .sort((a, b) => b.score - a.score)
  .slice(0, 3)

console.log({
  query: buyerIntent,
  location: buyerLocation,
  shortlist: shortlist.map(({ result, manifest, offer, score }) => ({
    score,
    page: result.page.name,
    slug: result.page.slug,
    sellerLocation: result.page.location ?? manifest.page.location,
    offer: offer?.name,
    price: offer?.price,
    agentJson: result.page.agent_json_url,
  })),
})

const top = shortlist[0]
if (!top?.offer) {
  console.log('No actionable Nexez page found for this buyer intent.')
  process.exit(0)
}

const acceptsNegotiation = Boolean(
  (top.offer as { accepts_negotiation?: boolean }).accepts_negotiation || top.offer.negotiation_action,
)

const validation = acceptsNegotiation
  ? await nexez.validateNegotiation({
      slug: top.result.page.slug,
      offer: top.offer.key,
      query: buyerIntent,
      budget: buyerBudget,
      timeline: 'next 2 weeks',
      requestedTerms: {
        location: buyerLocation,
        approvalBoundary: 'Dry-run only. Do not contact seller until buyer approves.',
      },
    })
  : await nexez.validateCheckout({
      slug: top.result.page.slug,
      offer: top.offer.key,
      query: buyerIntent,
      buyerReference: `location:${buyerLocation}`,
    })

console.log({
  recommendedNextStep: acceptsNegotiation ? 'ask buyer to approve negotiation submission' : 'ask buyer to approve checkout handoff',
  selectedPage: top.result.page.slug,
  selectedOffer: top.offer.key,
  dryRun: validation,
})

function scoreCandidate(result: NexezSearchResult, manifest: AgentPageManifest): number {
  const locationSignal = result.location_match ? 12 : 0
  const actionSignal = result.offer?.action || manifest.offers.some((offer) => offer.action || offer.negotiation_action) ? 10 : 0
  const priceSignal = result.offer?.price || manifest.offers.some((offer) => offer.price) ? 6 : 0
  const faqSignal = manifest.faqs?.length ? 3 : 0
  const readiness = readNumber((manifest.certification as { score?: unknown } | undefined)?.score)

  return Math.round((result.score || 0) + locationSignal + actionSignal + priceSignal + faqSignal + readiness / 10)
}

function readNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}
