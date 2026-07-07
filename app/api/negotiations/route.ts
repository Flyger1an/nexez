import { NextResponse, after } from 'next/server'
import {
  AgentPage,
  BASIC_OWNER_PAGE_SELECT,
  SERVER_PAGE_SELECT,
  getCheckoutOffer,
  getCheckoutOfferKey,
  getBaseUrl,
} from '../../../lib/agent-page'
import { parseMoneyCents } from '../../../lib/checkout'
import { appUrl } from '../../../lib/site'
import { evaluateProposal } from '../../../lib/offer-rules'
import { enforceNegotiationRateLimit } from '../../../lib/rate-limit'
import { sanitizeBuyerInput } from '../../../lib/negotiation-input'
import { buildNegotiationEmail, sendEmail } from '../../../lib/email'
import { resolveOwnerNotifyEmail } from '../../../lib/server/owner-email'
import { sendPushToUser } from '../../../lib/push'
import { supabase } from '../../../lib/supabase'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../utils/supabase/admin'
import { ownerAllows } from '../../../lib/server/plan'
import { negotiationService } from '../../../lib/negotiation.service'
import { captureError } from '../../../lib/observability'

// The LLM decision runs in an `after()` callback (and a backstop cron). On Vercel
// `after` extends the invocation via waitUntil, so the route needs headroom beyond
// the response to finish the LLM round-trip (~p95 5.5s) before the function ends.
export const maxDuration = 60

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
  /** Persistent thread continuation (from /negotiate/[id] or an agent follow-up). */
  negotiationId?: string
  /** Credential issued at creation; required to continue an existing negotiation. */
  statusToken?: string
}

async function getPublishedPage(slug: string) {
  // The negotiation flow needs the owner-private offer `rules` (floor clamp +
  // dryRun rules eval), so read the base table with the service-role client -
  // anon can't read it anymore and the public view strips `rules`. Falls back to
  // the anon client only when no admin env is set (tests, where it's mocked).
  const db = hasSupabaseAdminEnv() ? createAdminClient() : supabase

  const { data, error } = await db
    .from('pages')
    .select(SERVER_PAGE_SELECT)
    .eq('slug', slug)
    .eq('is_published', true)
    .single<AgentPage>()

  if (!error) return data

  const { data: fallback } = await db
    .from('pages')
    .select(BASIC_OWNER_PAGE_SELECT)
    .eq('slug', slug)
    .eq('is_published', true)
    .single<AgentPage>()

  return fallback
}

export async function POST(request: Request) {
  const wantsJson = request.headers.get('accept')?.includes('application/json')
  let input: NegotiationInput
  try {
    input = await readNegotiationInput(request)
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  // Cap untrusted buyer fields at the single entry point - this bounds both the
  // persisted message log and the LLM prompt (prompt-stuffing / cost guard, and
  // limits what an injection payload can carry). Done before rate limiting so the
  // per-agent key uses the capped buyerAgent.
  Object.assign(input, sanitizeBuyerInput(input))

  const platformBase = getBaseUrl()
  let baseUrl = platformBase

  // Layered quotas (per IP + per page + per agent) - keyed on the parsed input so
  // one page or one named agent can't dominate. Done after parsing so we have slug.
  const limited = await enforceNegotiationRateLimit(request, { slug: input.slug, buyerAgent: input.buyerAgent })
  if (limited) return limited

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

  // Custom domain preference for response URLs (after page is fetched so we have verified domain).
  // Use verified custom when the request arrived on it; otherwise the hardened canonical.
  if (page.custom_domain && page.custom_domain_verified) {
    const reqHost = (request.headers.get('host') || '').split(':')[0]
    if (reqHost === page.custom_domain || reqHost === `www.${page.custom_domain}`) {
      baseUrl = `https://${page.custom_domain}${page.domain_path || ''}`.replace(/\/$/, '')
    }
  }

  // Plan gate: negotiation (make-an-offer + smart-pricing rules) is a Pro feature.
  // If the page owner isn't on Pro+, the page doesn't accept offers (resolved with
  // the admin client since this is a public, buyer-facing route).
  const ownerId = (page as { owner_id?: string | null }).owner_id ?? null
  const ownerNegotiationAllowed = hasSupabaseAdminEnv()
    ? (ownerId ? await ownerAllows(createAdminClient(), ownerId, 'negotiation') : false)
    : true
  if (!ownerNegotiationAllowed) {
    return NextResponse.json({ error: 'This page is not accepting offers - use the listed price to book or buy.' }, { status: 403 })
  }

  const offerKey = getCheckoutOfferKey(offer.kind, offer.index)
  const proposedPriceCents = parseMoneyCents(input.budget)

  // Legacy dry-run semantics: validate the proposal without persisting anything.
  // Short-circuit before the negotiation service - it inserts agent_negotiations +
  // negotiation_messages rows, none of which a dry run may do. Page + offer
  // existence are already validated above; run only the deterministic rules eval.
  if (input.dryRun) {
    const rulesEvaluation = evaluateProposal(
      { offerType: offer.offerType, rules: offer.rules, price: offer.price },
      { proposedPriceCents },
    )
    return NextResponse.json({
      ok: true,
      dryRun: true,
      rulesEvaluation,
      publicPageUrl: `${baseUrl}/${page.slug}`,
    })
  }

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
    // Phase 1 (sync): record the proposal + queue the decision. The LLM runs in
    // the `after()` callback below - the response returns immediately so buyer
    // latency is decoupled from provider latency.
    const result = await negotiationService.submitProposal({
      slug: input.slug,
      offerKey,
      buyerProposal,
      negotiationId: input.negotiationId,
      statusToken: input.statusToken,
    })

    // Phase 2 (async): produce the decision after the response is sent. The
    // backstop cron (/api/cron/process-negotiations) re-drives it if this never
    // runs (instance death); the atomic claim makes the two safe to both fire.
    after(() =>
      negotiationService.runDecision(result.negotiationId).catch((e) =>
        captureError(e instanceof Error ? e : new Error(String(e)), { negotiationId: result.negotiationId, phase: 'after' }),
      ),
    )

    // Notify the owner of a fresh proposal (continuations don't re-notify). Resolve the
    // recipient with a fallback to the owner's ACCOUNT email - many pages never set an
    // explicit contact_email, and without this the notification is silently skipped (the
    // root cause of the missed proposal emails). Send INLINE (awaited) so delivery never
    // depends on after() flushing; try/catch so a send failure can't break the buyer's
    // submission. (First-proposal only, so the latency cost is bounded.)
    if (!input.negotiationId) {
      try {
          const ownerEmail = await resolveOwnerNotifyEmail({
            contactEmail: (page as { contact_email?: string | null }).contact_email,
            ownerId,
          })
        if (ownerEmail) {
          const mail = await buildNegotiationEmail({
            businessName: page.name || page.slug,
            offerName: offer.name,
            budget: input.budget,
            timeline: input.timeline,
            query: input.query,
            buyerAgent: input.buyerAgent,
            inboxUrl: appUrl('/dashboard/negotiations'),
          })
          const sent = await sendEmail({ to: ownerEmail, subject: mail.subject, html: mail.html, text: mail.text })
          if (!sent.ok && !sent.skipped) console.error('[email] negotiation notify failed:', sent.error)
        }
      } catch (e) {
        console.error('[email] negotiation notify threw:', e instanceof Error ? e.message : e)
      }
      // Mobile push to the seller, alongside the email (best-effort: never blocks the buyer).
      try {
        await sendPushToUser(ownerId, {
          title: 'New negotiation',
          body: `${offer.name} - ${input.budget || 'new offer'}${input.buyerAgent ? ` · ${input.buyerAgent}` : ''}`,
          data: { type: 'negotiation', negotiationId: result.negotiationId, slug: input.slug },
        })
      } catch {
        // swallow - a push failure must not affect the negotiation flow
      }
    }

    const statusUrl = result.statusToken
      ? `${platformBase}/api/negotiations/status?id=${result.negotiationId}&token=${result.statusToken}`
      : undefined

    if (!wantsJson) {
      // Form posts continuing an existing thread go back to the persistent page
      // (full history, resumable); fresh form proposals keep the public-page redirect.
      return NextResponse.redirect(
        input.negotiationId
          ? result.persistentLink
          : `${baseUrl}/${page.slug}?negotiation=created`,
        { status: 303 },
      )
    }

    const escrowMode = process.env.STRIPE_SECRET_KEY ? 'manual_capture_ready' : 'not_configured'

    // Full-async contract: the decision (accept/counter/amount/settlement) is NOT
    // known at POST time. Agents poll statusUrl for it. Only return what's certain
    // at submit time.
    return NextResponse.json({
      ok: true,
      status: result.status,
      decisionPending: true,
      negotiationId: result.negotiationId,
      persistentLink: result.persistentLink,
      negotiationUrl: result.persistentLink,
      escrowMode,
      stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
      publicPageUrl: `${baseUrl}/${page.slug}`,
      next: getNextStep(escrowMode),
      message: 'Proposal received. Poll statusUrl for the seller decision.',
      ...(result.statusToken ? { statusToken: result.statusToken, statusUrl } : {}),
    })
  } catch (err: any) {
    if (err?.status === 409) {
      // A decision is already in flight for this thread. For the form, bounce back
      // to the persistent page (where the poller is shown) rather than a raw 409.
      if (!wantsJson && input.negotiationId) {
        return NextResponse.redirect(
          `${baseUrl}/negotiate/${input.negotiationId}${input.statusToken ? `?token=${input.statusToken}` : ''}`,
          { status: 303 },
        )
      }
      return NextResponse.json(
        { error: err.message || 'A decision is already in progress for this negotiation.' },
        { status: 409 },
      )
    }
    if (err?.status === 404) {
      // Continuation with a missing/wrong status token - constant 404 so the
      // endpoint leaks nothing about which negotiations exist.
      return NextResponse.json({ error: 'Negotiation not found.' }, { status: 404 })
    }
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
    // The /negotiate/[id] continuation form posts these as hidden fields; without
    // them a follow-up would silently fork a brand-new negotiation.
    negotiationId: String(form.get('negotiationId') || '') || undefined,
    statusToken: String(form.get('statusToken') || '') || undefined,
  }
}

function getNextStep(escrowMode: string) {
  if (escrowMode === 'manual_capture_ready') {
    return 'Poll statusUrl for the seller decision (accept / counter / clarify). On agreement, fund via /api/negotiations/pay to secure it in escrow.'
  }

  return 'Poll statusUrl for the seller decision. Escrow hold becomes available after Stripe payments are enabled.'
}
