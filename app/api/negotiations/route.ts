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
import { sendSellerPushToUser } from '../../../lib/push'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../utils/supabase/admin'
import { ownerAllows, getOwnerBillingState } from '../../../lib/server/plan'
import { negotiationService } from '../../../lib/negotiation.service'
import { captureError } from '../../../lib/observability'
import { deliverQueuedSmsNotifications, enqueueSellerNegotiationSms } from '../../../lib/server/sms-notifications'
import {
  actionRequestHash,
  actionApprovalRequired,
  actionApprovalSecret,
  approvalInput,
  issueActionApprovalToken,
  parsePublicActionIdempotencyKey,
  scopedIdempotencyHash,
  verifyActionApprovalToken,
} from '../../../lib/action-approval'

// The LLM decision runs in an `after()` callback (and a backstop cron). On Vercel
// `after` extends the invocation via waitUntil, so the route needs headroom beyond
// the response to finish the LLM round-trip (~p95 5.5s) before the function ends.
export const maxDuration = 60

// Retry-loop tripwire: this many fresh negotiations from one named agent on one
// page inside the window is an integration stuck in a loop (it should be polling
// statusUrl / paying, not re-creating). Alert ops via Sentry.
const RETRY_LOOP_WINDOW_MS = 10 * 60_000
const RETRY_LOOP_THRESHOLD = 3

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
  /** Short-lived token returned by a matching dry-run validation. */
  approvalToken?: string
}

async function getPublishedPage(slug: string) {
  // The negotiation flow needs the owner-private offer `rules` (floor clamp +
  // dryRun rules eval), so read the base table with the service-role client.
  // The public view strips `rules`, and POST fails closed before this helper
  // whenever the privileged entitlement resolver is unavailable.
  const db = createAdminClient()

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

  if (!input.buyerAgent) input.buyerAgent = cleanAgentHeader(request.headers.get('x-nexez-buyer-agent')) || undefined

  // Cap untrusted buyer fields at the single entry point - this bounds both the
  // persisted message log and the LLM prompt (prompt-stuffing / cost guard, and
  // limits what an injection payload can carry). Done before rate limiting so the
  // per-agent key uses the capped buyerAgent.
  Object.assign(input, sanitizeBuyerInput(input))

  const idempotency = parsePublicActionIdempotencyKey(request)
  if (!idempotency.ok) {
    return NextResponse.json({ error: idempotency.error, code: 'invalid_idempotency_key' }, { status: 400 })
  }

  const platformBase = getBaseUrl()
  let baseUrl = platformBase

  // Layered quotas (per IP + per page + per agent) - keyed on the parsed input so
  // one page or one named agent can't dominate. Done after parsing so we have slug.
  const limited = await enforceNegotiationRateLimit(request, { slug: input.slug, buyerAgent: input.buyerAgent })
  if (limited) return limited

  if (!input.slug || !input.offer) {
    return NextResponse.json({ error: 'Missing negotiation listing or offer.' }, { status: 400 })
  }
  if (!hasSupabaseAdminEnv()) {
    return NextResponse.json(
      { error: 'Negotiation is temporarily unavailable.', code: 'entitlement_unavailable' },
      { status: 503 },
    )
  }

  const page = await getPublishedPage(input.slug)
  if (!page) {
    return NextResponse.json({ error: 'Negotiation listing not found.' }, { status: 404 })
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
  const admin = createAdminClient()
  const ownerNegotiationAllowed = ownerId ? await ownerAllows(admin, ownerId, 'negotiation') : false
  if (!ownerNegotiationAllowed) {
    return NextResponse.json({ error: 'This listing is not accepting offers - use the listed price to book or buy.' }, { status: 403 })
  }

  // Compatibility gate for an explicit operational suspension. Billing expiry
  // falls back to Free and does not suppress negotiation.
  if (ownerId && (await getOwnerBillingState(admin, ownerId)).isPaused) {
    return NextResponse.json(
      { error: 'This seller’s storefront is paused and not accepting offers right now.' },
      { status: 402 },
    )
  }

  const offerKey = getCheckoutOfferKey(offer.kind, offer.index)
  const proposedPriceCents = parseMoneyCents(input.budget)

  if (!input.dryRun) {
    const approvalSecret = actionApprovalSecret()
    if (actionApprovalRequired() && !approvalSecret) {
      return NextResponse.json(
        { error: 'Action approval is required but not configured.', code: 'approval_not_configured' },
        { status: 503 },
      )
    }
    if (actionApprovalRequired() && !input.approvalToken) {
      return NextResponse.json(
        { error: 'Validate this negotiation and obtain buyer approval before submitting it.', code: 'approval_required' },
        { status: 403 },
      )
    }
    if (input.approvalToken) {
      const approval = verifyActionApprovalToken(
        input.approvalToken,
        'negotiation',
        input as Record<string, unknown>,
      )
      if (!approval.ok) {
        return NextResponse.json(
          { error: 'Negotiation approval is invalid, expired, or does not match this action.', code: 'approval_invalid' },
          { status: 403 },
        )
      }
    }
  }

  // Legacy dry-run semantics: validate the proposal without persisting anything.
  // Short-circuit before the negotiation service - it inserts agent_negotiations +
  // negotiation_messages rows, none of which a dry run may do. Page + offer
  // existence are already validated above; run only the deterministic rules eval.
  if (input.dryRun) {
    const rulesEvaluation = evaluateProposal(
      { offerType: offer.offerType, rules: offer.rules, price: offer.price },
      { proposedPriceCents, requestedTerms: input.requestedTerms },
    )
    const approval = issueActionApprovalToken('negotiation', approvalInput(input as Record<string, unknown>))
    if (actionApprovalRequired() && !approval) {
      return NextResponse.json(
        { error: 'Action approval is required but not configured.', code: 'approval_not_configured' },
        { status: 503 },
      )
    }
    return NextResponse.json({
      ok: true,
      dryRun: true,
      rulesEvaluation,
      publicPageUrl: `${baseUrl}/${page.slug}`,
      approvalTokenRequired: actionApprovalRequired(),
      ...(approval ?? {}),
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
    agentClient: cleanAgentHeader(request.headers.get('x-nexez-client')),
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
      idempotencyKeyHash: idempotency.key
        ? scopedIdempotencyHash('negotiation', `${input.slug}:${input.negotiationId || 'new'}`, idempotency.key)
        : undefined,
      // Always computed (not only when an Idempotency-Key is sent): the service's
      // content-based replay uses it to collapse retry loops from agents that
      // rotate their key per attempt or send none at all - the key-scoped hash
      // alone let byte-identical retries fork a new negotiation every time.
      idempotencyRequestHash: actionRequestHash('negotiation', input as Record<string, unknown>),
    })

    // Phase 2 (async): produce the decision after the response is sent. The
    // backstop cron (/api/cron/process-negotiations) re-drives it if this never
    // runs (instance death); the atomic claim makes the two safe to both fire.
    if (!result.replayed) {
      after(() =>
        negotiationService.runDecision(result.negotiationId).catch((e) =>
          captureError(e instanceof Error ? e : new Error(String(e)), { negotiationId: result.negotiationId, phase: 'after' }),
        ),
      )
    }

    // Notify the owner of a fresh proposal (continuations don't re-notify). Resolve the
    // recipient with a fallback to the owner's ACCOUNT email - many pages never set an
    // explicit contact_email, and without this the notification is silently skipped (the
    // root cause of the missed proposal emails). Send INLINE (awaited) so delivery never
    // depends on after() flushing; try/catch so a send failure can't break the buyer's
    // submission. (First-proposal only, so the latency cost is bounded.)
    if (!input.negotiationId && !result.replayed) {
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
        await sendSellerPushToUser(ownerId, 'negotiation.created', {
          title: 'New negotiation',
          body: `${offer.name} - ${input.budget || 'new offer'}${input.buyerAgent ? ` · ${input.buyerAgent}` : ''}`,
          data: { type: 'negotiation', negotiationId: result.negotiationId, slug: input.slug },
        })
      } catch {
        // swallow - a push failure must not affect the negotiation flow
      }

      // Record a seller-owned, consented SMS alert before returning. The durable
      // outbox is intentionally separate from the fast path: a Twilio outage,
      // missing preference, or worker failure can never reject the buyer's
      // proposal. The five-minute cron is the backstop if this after() callback
      // does not get a chance to run.
      try {
        const sms = await enqueueSellerNegotiationSms({
          ownerId,
          negotiationId: result.negotiationId,
          ...(admin ? { admin } : {}),
        })
        if (sms.queued) {
          after(() => deliverQueuedSmsNotifications({ limit: 1 }).catch(() => undefined))
        }
      } catch {
        // SMS is optional and must never affect proposal creation.
      }

      // Retry-loop tripwire (deferred, observability-only). The content-replay
      // collapse in negotiationService absorbs byte-identical retries; this catches
      // NEAR-identical ones (an agent "trying something different" each attempt)
      // and pages ops via Sentry instead of leaving it to a later debug session.
      after(async () => {
        try {
          if (!admin) return
          const windowStart = new Date(Date.now() - RETRY_LOOP_WINDOW_MS).toISOString()
          const { count } = await admin
            .from('agent_negotiations')
            .select('id', { count: 'exact', head: true })
            .eq('slug', input.slug)
            .eq('buyer_agent', input.buyerAgent || 'Unknown Agent')
            .gte('created_at', windowStart)
          if ((count ?? 0) >= RETRY_LOOP_THRESHOLD) {
            captureError(new Error('possible buyer-agent retry loop'), {
              slug: input.slug,
              buyerAgent: input.buyerAgent || 'Unknown Agent',
              negotiationsInWindow: count,
              windowMs: RETRY_LOOP_WINDOW_MS,
              latestNegotiationId: result.negotiationId,
            })
          }
        } catch {
          // observability only - never affects the buyer response
        }
      })
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
      message: result.replayed
        ? 'This proposal was already received (matched an open negotiation with identical content). Poll statusUrl for the seller decision - do not resubmit.'
        : 'Proposal received. Poll statusUrl for the seller decision.',
      replayed: result.replayed,
      idempotencyKeyAccepted: Boolean(idempotency.key),
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
        {
          error: err.message || 'A decision is already in progress for this negotiation.',
          ...(err.code ? { code: err.code } : {}),
        },
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
  for (const key of ['scope', 'deliverables', 'revisionCount', 'projectWeeks'] as const) {
    const value = String(form.get(`requestedTerms.${key}`) || '').trim()
    if (!value) continue
    requestedTerms[key] = (key === 'revisionCount' || key === 'projectWeeks') && /^\d+$/.test(value)
      ? Number(value)
      : value
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
    approvalToken: String(form.get('approvalToken') || '') || undefined,
  }
}

function cleanAgentHeader(value: string | null) {
  if (!value) return null
  return value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 120) || null
}

function getNextStep(escrowMode: string) {
  if (escrowMode === 'manual_capture_ready') {
    return 'Poll statusUrl for the seller decision (accept / counter / clarify). On agreement, fund via /api/negotiations/pay to secure it in escrow.'
  }

  return 'Poll statusUrl for the seller decision. Escrow hold becomes available after Stripe payments are enabled.'
}
