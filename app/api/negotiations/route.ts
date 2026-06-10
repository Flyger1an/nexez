import { randomBytes, randomUUID } from 'crypto'
import { NextResponse, after } from 'next/server'
import {
  AgentPage,
  BASIC_OWNER_PAGE_SELECT,
  PUBLIC_PAGE_SELECT,
  getCheckoutOffer,
  getCheckoutOfferKey,
  getRequestBaseUrl,
} from '../../../lib/agent-page'
import { parseMoneyCents } from '../../../lib/checkout'
import { evaluateProposal } from '../../../lib/offer-rules'
import { reviewProposal } from '../../../lib/proposal-review'
import { enforceRateLimit } from '../../../lib/rate-limit'
import { buildNegotiationEmail, sendEmail } from '../../../lib/email'
import { supabase } from '../../../lib/supabase'

type NegotiationInput = {
  slug: string
  offer: string
  buyerAgent?: string
  query?: string
  requestedTerms?: Record<string, unknown>
  budget?: string
  timeline?: string
  contact?: string
  dryRun?: boolean
}

async function getPublishedPage(slug: string) {
  const { data, error } = await supabase
    .from('pages')
    .select(PUBLIC_PAGE_SELECT)
    .eq('slug', slug)
    .eq('is_published', true)
    .single<AgentPage>()

  if (!error) return data

  const { data: fallback } = await supabase
    .from('pages')
    .select(BASIC_OWNER_PAGE_SELECT)
    .eq('slug', slug)
    .eq('is_published', true)
    .single<AgentPage>()

  return fallback
}

export async function POST(request: Request) {
  const limited = enforceRateLimit(request, 'negotiations', 20, 60_000)
  if (limited) return limited

  const wantsJson = request.headers.get('accept')?.includes('application/json')
  const input = await readNegotiationInput(request)
  const baseUrl = getRequestBaseUrl(request)

  if (!input.slug || !input.offer) {
    return NextResponse.json({ error: 'Missing negotiation page or offer.' }, { status: 400 })
  }

  const page = await getPublishedPage(input.slug)
  if (!page) {
    return NextResponse.json({ error: 'Negotiation page not found.' }, { status: 404 })
  }

  const offer = getCheckoutOffer(page, input.offer)
  if (!offer) {
    return NextResponse.json({ error: 'Negotiation offer not found.' }, { status: 404 })
  }

  const offerKey = getCheckoutOfferKey(offer.kind, offer.index)
  const amountCents = parseMoneyCents(offer.price)
  const escrowMode = process.env.STRIPE_SECRET_KEY && amountCents ? 'manual_capture_ready' : 'not_configured'

  // Advanced Smart Rules + LLM: Use full proposal review (using the platform's configured LLM when available + rules clamping).
  // This provides accept/counter/reject with reasoning and suggested counter.
  // Auto-accept only if LLM or rules decide 'accept' and within bounds.
  const proposedPriceCents = parseMoneyCents(input.budget)
  const reviewInput = {
    offer: { name: offer.name, price: offer.price, offerType: offer.offerType, rules: offer.rules },
    proposal: { proposedPriceCents, query: input.query, timeline: input.timeline },
    llmAllowed: true, // Use LLM (platform-configured provider)
  }
  const proposalReview = await reviewProposal(reviewInput)
  const rulesEvaluation = evaluateProposal(offer, { proposedPriceCents })
  const autoAccepted = proposalReview.recommendation === 'accept' || rulesEvaluation.decision === 'auto_accept'

  // The anon caller has no SELECT on agent_negotiations (RLS), so the insert
  // can't RETURN the row — generate id + status token server-side instead so
  // the agent can poll /api/negotiations/status later.
  const negotiationId = randomUUID()
  const statusToken = randomBytes(16).toString('hex')

  const negotiation = {
    id: negotiationId,
    page_id: page.id,
    owner_id: page.owner_id,
    slug: page.slug,
    offer_key: offerKey,
    offer_name: offer.name,
    offer_kind: offer.kind,
    buyer_agent: input.buyerAgent || request.headers.get('user-agent') || 'Unknown agent',
    buyer_query: input.query || null,
    requested_terms: input.requestedTerms || {},
    budget_text: input.budget || null,
    timeline_text: input.timeline || null,
    contact: input.contact || null,
    status: autoAccepted ? 'agreement_proposed' : 'negotiation',
    escrow_mode: escrowMode,
    amount_cents: amountCents,
    status_token: statusToken,
    metadata: {
      source: 'agent_negotiation',
      referrer: request.headers.get('referer'),
      stripe_configured: Boolean(process.env.STRIPE_SECRET_KEY),
      dry_run: Boolean(input.dryRun),
      rules_evaluation: {
        decision: rulesEvaluation.decision,
        reasons: rulesEvaluation.reasons,
        proposed_price_cents: proposedPriceCents,
        evaluated_at: new Date().toISOString(),
      },
      proposal_review: {
        recommendation: proposalReview.recommendation,
        counter: proposalReview.counter,
        reasoning: proposalReview.reasoning,
        source: proposalReview.source,
        model: proposalReview.model,
      },
    },
  }

  if (input.dryRun) {
    return NextResponse.json({
      ok: true,
      dryRun: true,
      status: negotiation.status,
      autoAccepted,
      rulesEvaluation,
      proposalReview,
      escrowMode,
      stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
      amountCents,
      next: getNextStep(escrowMode),
      negotiation: { ...negotiation, id: undefined, status_token: undefined },
    })
  }

  // Insert WITHOUT a RETURNING/select: the public agent caller is anon, which
  // (correctly) has no SELECT policy on agent_negotiations, so reading the row
  // back would be rejected by RLS. We already know everything we need to reply.
  const { error } = await supabase.from('agent_negotiations').insert(negotiation)

  if (error) {
    return NextResponse.json(
      {
        error: 'Proposal validation passed, but seller inbox storage is blocked. Apply the agent_negotiations RLS fix before using this feature.',
        detail: error.message,
      },
      { status: 412 },
    )
  }

  // Email the business about the new request (gated on RESEND_API_KEY; no-op
  // otherwise). Sent after the response so it never adds latency.
  const ownerEmail = (page as { contact_email?: string | null }).contact_email
  if (ownerEmail) {
    const mail = buildNegotiationEmail({
      businessName: page.name || page.slug,
      offerName: offer.name,
      budget: input.budget,
      timeline: input.timeline,
      query: input.query,
      buyerAgent: input.buyerAgent,
      inboxUrl: `${baseUrl}/dashboard/negotiations`,
    })
    after(() => sendEmail({ to: ownerEmail, subject: mail.subject, html: mail.html, text: mail.text }))
  }

  if (!wantsJson) {
    return NextResponse.redirect(
      `${baseUrl}/${page.slug}?negotiation=${autoAccepted ? 'accepted' : 'created'}`,
      { status: 303 },
    )
  }

  return NextResponse.json({
    ok: true,
    status: negotiation.status,
    autoAccepted,
    rulesEvaluation,
    message: autoAccepted
      ? "Auto-accepted within the seller's rules — agreement proposed. The seller will finalize payment/scheduling."
      : 'Proposal received — under review by the seller.',
    // Returned exactly once: lets the submitting agent poll status later.
    statusToken,
    statusUrl: `${baseUrl}/api/negotiations/status?id=${negotiationId}&token=${statusToken}`,
    escrowMode,
    stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
    next: getNextStep(escrowMode),
    publicPageUrl: `${baseUrl}/${page.slug}`,
  })
}

async function readNegotiationInput(request: Request): Promise<NegotiationInput> {
  const contentType = request.headers.get('content-type') || ''

  if (contentType.includes('application/json')) {
    return request.json()
  }

  const form = await request.formData()
  const requestedTermsRaw = String(form.get('requestedTerms') || '{}')
  let requestedTerms: Record<string, unknown> = {}
  try {
    requestedTerms = JSON.parse(requestedTermsRaw)
  } catch {
    requestedTerms = { note: requestedTermsRaw }
  }

  return {
    slug: String(form.get('slug') || ''),
    offer: String(form.get('offer') || ''),
    buyerAgent: String(form.get('buyerAgent') || ''),
    query: String(form.get('query') || ''),
    requestedTerms,
    budget: String(form.get('budget') || ''),
    timeline: String(form.get('timeline') || ''),
    contact: String(form.get('contact') || ''),
    dryRun: form.get('dryRun') === 'true',
  }
}

function getNextStep(escrowMode: string) {
  if (escrowMode === 'manual_capture_ready') {
    return 'Seller can review terms, propose agreement, then create a manual-capture Stripe hold in the next checkout phase.'
  }

  return 'Seller can review terms and respond manually. Escrow hold becomes available after STRIPE_SECRET_KEY is configured.'
}
