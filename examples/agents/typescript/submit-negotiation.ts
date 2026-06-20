import { createNexezClient } from '@nexez/agent-sdk'

const nexez = createNexezClient({ buyerAgent: 'nexez-typescript-example' })

const proposal = {
  slug: 'nexez-agent-negotiation-lab',
  offer: 'services-0',
  query: 'Buyer wants a one-week agent negotiation sprint.',
  budget: 'USD 2100',
  timeline: 'next week',
  contact: 'buyer@example.com',
  requestedTerms: {
    scope: 'Discovery call, agent-readable offer review, and dry-run guidance.',
  },
}

const dryRun = await nexez.validateNegotiation(proposal)
console.log({ dryRun })

// In a real buyer agent, stop here and ask the buyer:
// "Approve sending this proposal to the seller?"
const approvedByBuyer = false
if (!approvedByBuyer) {
  console.log('Buyer approval required before submitNegotiation.')
  process.exit(0)
}

const submitted = await nexez.submitNegotiation(proposal)
console.log({ submitted })

if (submitted.statusUrl) {
  const status = await fetch(submitted.statusUrl, {
    headers: { accept: 'application/json', 'user-agent': 'nexez-typescript-example' },
  }).then((res) => res.json())
  console.log({ status })
}
