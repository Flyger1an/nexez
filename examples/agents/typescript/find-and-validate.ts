import { createNexezClient } from '@nexez/agent-sdk'

const nexez = createNexezClient({ buyerAgent: 'nexez-typescript-example' })

const matches = await nexez.search('remote launch strategy consultant under 3000', {
  location: 'Remote',
  limit: 5,
})

const first = matches.results[0]
if (!first?.offer) {
  console.log('No actionable Nexez offer found.')
  process.exit(0)
}

const slug = first.page.slug
const offerKey = first.offer.key
const page = await nexez.getAgentPage(slug)
const offer = page.offers.find((item) => item.key === offerKey)

if (!offer) {
  console.log(`Page ${slug} loaded, but offer ${offerKey} was not found.`)
  process.exit(0)
}

const supportsNegotiation = Boolean(offer.negotiation_action)
const validation = supportsNegotiation
  ? await nexez.validateNegotiation({
      slug,
      offer: offerKey,
      query: 'Buyer wants a remote launch strategy engagement under 3000.',
      budget: 'USD 2500',
      timeline: 'next two weeks',
    })
  : await nexez.validateCheckout({
      slug,
      offer: offerKey,
      query: 'Buyer wants to validate checkout before booking.',
    })

console.log({
  page: slug,
  offer: offerKey,
  action: supportsNegotiation ? 'negotiation' : 'checkout',
  validationOk: validation.ok,
})
