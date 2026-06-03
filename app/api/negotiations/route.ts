import { NextResponse } from 'next/server'
import {
  AgentPage,
  BASIC_OWNER_PAGE_SELECT,
  PUBLIC_PAGE_SELECT,
  getBaseUrl,
  getCheckoutOffer,
  getCheckoutOfferKey,
} from '../../../lib/agent-page'
import { parseMoneyCents } from '../../../lib/checkout'
import { enforceRateLimit } from '../../../lib/rate-limit'
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
  const negotiation = {
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
    status: 'negotiation',
    escrow_mode: escrowMode,
    amount_cents: amountCents,
    metadata: {
      source: 'agent_negotiation',
      referrer: request.headers.get('referer'),
      stripe_configured: Boolean(process.env.STRIPE_SECRET_KEY),
      dry_run: Boolean(input.dryRun),
    },
  }

  if (input.dryRun) {
    return NextResponse.json({
      ok: true,
      dryRun: true,
      status: 'negotiation',
      escrowMode,
      stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
      amountCents,
      next: getNextStep(escrowMode),
      negotiation,
    })
  }

  const { data, error } = await supabase
    .from('agent_negotiations')
    .insert(negotiation)
    .select('id, status, escrow_mode, created_at')
    .single()

  if (error) {
    return NextResponse.json(
      {
        error: 'Negotiation could not be created. Apply the agent_negotiations migration before using this feature.',
        detail: error.message,
      },
      { status: 412 },
    )
  }

  if (!wantsJson) {
    return NextResponse.redirect(`${getBaseUrl()}/${page.slug}?negotiation=created`, { status: 303 })
  }

  return NextResponse.json({
    ok: true,
    id: data.id,
    status: data.status,
    escrowMode: data.escrow_mode,
    stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
    next: getNextStep(data.escrow_mode),
    publicPageUrl: `${getBaseUrl()}/${page.slug}`,
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
