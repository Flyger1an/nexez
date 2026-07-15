import { createNexezClient, type AgentPageManifest, type AgentPageOffer } from '@nexez/agent-sdk'

const nexez = createNexezClient({ buyerAgent: 'nexez-buyer-approval-example' })

const proposal = {
  slug: process.env.NEXEZ_APPROVAL_SLUG ?? 'nexez-agent-negotiation-lab',
  offer: process.env.NEXEZ_APPROVAL_OFFER ?? 'services-0',
  query: process.env.NEXEZ_APPROVAL_QUERY ?? 'Buyer wants a one-week agent negotiation sprint.',
  budget: process.env.NEXEZ_APPROVAL_BUDGET ?? 'USD 2100',
  timeline: process.env.NEXEZ_APPROVAL_TIMELINE ?? 'next week',
  requestedTerms: {
    scope: 'Discovery call, agent-readable offer review, and dry-run guidance.',
  },
}
const contactToShare = process.env.NEXEZ_APPROVAL_CONTACT ?? 'buyer@example.com'

const manifest = await nexez.getAgentPage(proposal.slug)
const offer = manifest.offers.find((item) => item.key === proposal.offer)

if (!offer) {
  console.log(`Offer ${proposal.offer} was not found on ${proposal.slug}.`)
  process.exit(0)
}

const dryRun = offer.negotiation_action
  ? await nexez.validateNegotiation(proposal)
  : await nexez.validateCheckout({
      slug: proposal.slug,
      offer: proposal.offer,
      query: proposal.query,
    })

const approval = buildBuyerApprovalSummary({
  actionType: offer.negotiation_action ? 'submit_negotiation' : 'open_checkout',
  manifest,
  offer,
  proposal,
  contactToShare: contactToShare || null,
  dryRun,
})

console.log(JSON.stringify(approval, null, 2))

// In a real buyer agent, render approval.buyer_copy and wait for an explicit
// buyer click/tap/voice confirmation before performing the next action.
const approvedByBuyer = false
if (!approvedByBuyer) {
  console.log('Stopped: buyer approval is required before any side effect.')
  process.exit(0)
}

if (approval.action_type === 'submit_negotiation') {
  const submitted = await nexez.submitNegotiation({
    ...proposal,
    contact: contactToShare,
    approvalToken: getApprovalToken(dryRun),
    userApproved: true,
  }, {
    idempotencyKey: crypto.randomUUID(),
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
} else {
  const checkout = await nexez.startCheckout({
    slug: proposal.slug,
    offer: proposal.offer,
    query: proposal.query,
    buyerEmail: contactToShare || undefined,
    approvalToken: getApprovalToken(dryRun),
    userApproved: true,
  }, {
    idempotencyKey: crypto.randomUUID(),
  })
  console.log({
    checkout: {
      provider: checkout.provider,
      url: checkout.url,
    },
  })
}

type ApprovalActionType = 'submit_negotiation' | 'open_checkout'

function getApprovalToken(value: unknown) {
  if (!value || typeof value !== 'object') return undefined
  const token = (value as { approvalToken?: unknown }).approvalToken
  return typeof token === 'string' ? token : undefined
}

type ApprovalSummaryInput = {
  actionType: ApprovalActionType
  manifest: AgentPageManifest
  offer: AgentPageOffer
  proposal: typeof proposal
  contactToShare: string | null
  dryRun: unknown
}

function buildBuyerApprovalSummary(input: ApprovalSummaryInput) {
  const sellerName = input.manifest.page.name
  const offerPrice = input.offer.price ?? 'price not listed'
  const actionLabel =
    input.actionType === 'submit_negotiation' ? 'Approve negotiation submission' : 'Approve checkout handoff'
  const actionDescription =
    input.actionType === 'submit_negotiation'
      ? 'send this proposal to the seller'
      : 'open the seller checkout or booking flow'
  const contactDestination =
    input.actionType === 'submit_negotiation' ? sellerName : input.offer.checkout_url
  const contactNotice = input.contactToShare
    ? ` This will share ${input.contactToShare} with ${contactDestination}.`
    : ''

  return {
    schema_version: 'nexez.buyer-approval.v1',
    requires_buyer_approval: true,
    action_type: input.actionType,
    seller: {
      name: sellerName,
      slug: input.manifest.page.slug,
      public_url: input.manifest.page.url,
      website_url: input.manifest.page.website_url ?? null,
      location: input.manifest.page.location ?? null,
    },
    offer: {
      key: input.offer.key,
      name: input.offer.name,
      price: offerPrice,
      summary: input.offer.voice_summary ?? input.offer.description ?? null,
      checkout_url: input.offer.checkout_url,
    },
    proposal: {
      query: input.proposal.query,
      budget: input.proposal.budget,
      timeline: input.proposal.timeline,
      requested_terms: input.proposal.requestedTerms,
      contact_shared: false,
      contact_share_status: input.contactToShare ? 'pending_approval' : 'not_included',
      contact_to_share: input.contactToShare,
      contact_destination: input.contactToShare ? contactDestination : null,
    },
    dry_run: input.dryRun,
    risk_notes: [
      'No money should move before the buyer approves.',
      'No buyer contact details should be sent before approval.',
      'Dry-run validation may log an analytics attempt, but it does not create checkout, seller contact, or a negotiation.',
    ],
    buyer_copy: {
      title: `${sellerName} - ${input.offer.name}`,
      body: `I found ${input.offer.name} from ${sellerName} at ${offerPrice}. I can ${actionDescription} using your budget (${input.proposal.budget}) and timeline (${input.proposal.timeline}).${contactNotice}`,
      confirmation_question: `Do you approve this ${input.actionType === 'submit_negotiation' ? 'proposal submission' : 'checkout handoff'}?`,
      approve_label: actionLabel,
      cancel_label: 'Cancel',
    },
  }
}
