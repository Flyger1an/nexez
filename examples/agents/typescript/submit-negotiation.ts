import { createNexezClient } from '@nexez/agent-sdk'

const nexez = createNexezClient({ buyerAgent: 'nexez-typescript-example' })

const proposal = {
  slug: 'nexez-agent-negotiation-lab',
  offer: 'services-0',
  query: 'Buyer wants a one-week agent negotiation sprint.',
  budget: 'USD 2100',
  timeline: 'next week',
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

const submitted = await nexez.submitNegotiation({
  ...proposal,
  contact: 'buyer@example.com',
  userApproved: true,
})
console.log({
  submitted: {
    ok: submitted.ok,
    status: submitted.status,
    negotiationId: submitted.negotiationId,
    decisionPending: submitted.decisionPending,
  },
})

if (submitted.negotiationId && submitted.statusToken) {
  const status = await nexez.waitForNegotiationDecision({
    negotiationId: submitted.negotiationId,
    statusToken: submitted.statusToken,
    timeoutMs: 30_000,
    intervalMs: 2_000,
  })
  console.log({ status })
}
