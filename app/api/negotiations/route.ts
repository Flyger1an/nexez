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
import { negotiationService } from '../../../lib/negotiation.service'

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

  // Use the new Intelligent Negotiation Service for full conversational + persistent state.
  // This replaces the one-shot review with a full history-aware LLM call using function calling.
  // Supports continuation via negotiationId for the /negotiate/{id} persistent page.
  const proposedPriceCents = parseMoneyCents(input.budget)
  const buyerProposal = {
    proposedPriceCents,
    query: input.query,
    timeline: input.timeline,
    requestedTerms: input.requestedTerms,
    budget: input.budget,
    contact: input.contact,
    buyerAgent: input.buyerAgent,
  }

  try {
    const result = await negotiationService.startOrContinue({
      slug: input.slug,
      offerKey,
      buyerProposal,
      // If a persistent negotiationId is passed (from /negotiate page or agent follow-up), continue it.
      negotiationId: (input as any).negotiationId,
      statusToken: (input as any).statusToken,
    })

    if (input.dryRun) {
      return NextResponse.json({ ok: true, dryRun: true, ...result })
    }

    // Keep backward compat for existing one-shot agent POSTs (they get the status token).
    const ownerEmail = (page as { contact_email?: string | null }).contact_email
    if (ownerEmail && ! (input as any).negotiationId) {
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
        `${baseUrl}/${page.slug}?negotiation=${result.status === 'agreement_proposed' ? 'accepted' : 'created'}`,
        { status: 303 },
      )
    }

    // Maintain backward compatibility with existing agent manifests, public form,
    // and route tests that expect the old one-shot response shape.
    const legacyAutoAccepted = result.decision.action === 'accept'
    const legacyStatusToken = (input as any).negotiationId ? undefined : randomBytes(16).toString('hex') // for new creations
    const legacyEscrowMode = process.env.STRIPE_SECRET_KEY ? 'manual_capture_ready' : 'not_configured'

    return NextResponse.json({
      ok: true,
      status: result.status,
      autoAccepted: legacyAutoAccepted,
      rulesEvaluation: { decision: 'review' }, // legacy shape
      proposalReview: result.decision, // new decision is richer
      escrowMode: legacyEscrowMode,
      stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
      amountCents: null,
      next: getNextStep(legacyEscrowMode),
      publicPageUrl: `${baseUrl}/${page.slug}`,
      // New intelligent engine fields
      negotiationId: result.negotiationId,
      decision: result.decision,
      persistentLink: result.persistentLink,
      historyLength: result.history.length,
      message: result.decision.action === 'accept' 
        ? "Accepted within the seller's rules." 
        : result.decision.action === 'counter' 
          ? 'Counter-offer generated by intelligent negotiation engine.' 
          : 'Under review / clarification requested.',
      negotiationUrl: result.persistentLink,
      // For legacy agents: the status token (only on fresh creations)
      ...(legacyStatusToken ? { statusToken: legacyStatusToken, statusUrl: `${baseUrl}/api/negotiations/status?id=${result.negotiationId}&token=${legacyStatusToken}` } : {}),
    })
  } catch (err: any) {
    console.error('Intelligent negotiation error', err)
    return NextResponse.json({ error: 'Intelligent negotiation engine error: ' + err.message }, { status: 500 })
  }
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
