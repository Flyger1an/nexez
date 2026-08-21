import 'server-only'
import { AgentPage } from '../agent-page'
import { detectAgentVisit } from '../agent-detection'
import { createHash } from 'crypto'
import { getPagePrivateMeta } from './page-private-meta'
import { insertVerifiedAgentVisit, insertVerifiedCheckoutEvent } from './analytics-ingestion'

type LogAgentPageViewInput = {
  page: AgentPage
  requestHeaders?: Headers
  userAgent?: string | null
  referrer?: string | null
  url: string
}

export async function logAgentPageView({ page, requestHeaders, userAgent, referrer, url }: LogAgentPageViewInput) {
  const resolvedUserAgent = userAgent ?? requestHeaders?.get('user-agent') ?? null
  const resolvedReferrer = referrer ?? requestHeaders?.get('referer') ?? null
  const ipSignal = getPrivacySafeIpSignal(requestHeaders)
  const privateMeta = await getPagePrivateMeta(page.id)
  const ownerId = (page as { owner_id?: string | null }).owner_id ?? privateMeta.ownerId
  const detection = detectAgentVisit({
    userAgent: resolvedUserAgent,
    referrer: resolvedReferrer,
    hasIpSignal: Boolean(ipSignal.ipHash),
  })
  const path = getPathFromUrl(url, page.slug)

  try {
    const visitWrite = await insertVerifiedAgentVisit({
      page_id: page.id,
      owner_id: ownerId,
      slug: page.slug,
      path,
      referrer: resolvedReferrer,
      query: detection.query,
      user_agent: resolvedUserAgent,
      ip_hash: ipSignal.ipHash,
      is_ai_agent: detection.is_ai_agent,
      agent_type: detection.agent_type,
      confidence_score: detection.confidence_score,
      detection_signals: {
        ...detection.detection_signals,
        ip_source_header: ipSignal.sourceHeader,
        forwarded_chain_length: ipSignal.forwardedChainLength,
      },
    }, { source: 'public_agent_page' })
    const visitError = visitWrite.error

    let checkoutEventError = null

    if (detection.is_ai_agent) {
      const write = await insertVerifiedCheckoutEvent({
        page_id: page.id,
        owner_id: ownerId,
        slug: page.slug,
        offer_key: 'page',
        offer_name: page.name,
        offer_kind: 'services',
        event_type: 'agent_page_view',
        agent_user_agent: resolvedUserAgent || null,
        referrer: resolvedReferrer || null,
        query: detection.query,
        checkout_url: url,
        provider_url: page.website_url || null,
        stripe_session_id: null,
        metadata: {
          source: 'public_agent_page',
          path,
          agent_type: detection.agent_type,
          confidence_score: detection.confidence_score,
        },
      }, { source: 'public_agent_page', dedupeWindowMs: 60_000 })

      checkoutEventError = write.error
    }

    return {
      ok: !visitError && !checkoutEventError,
      visitError,
      checkoutEventError,
      detection,
    }
  } catch (error) {
    return { ok: false, error, detection }
  }
}

function getPathFromUrl(url: string, slug: string) {
  try {
    return new URL(url).pathname || `/${slug}`
  } catch {
    return `/${slug}`
  }
}

function getPrivacySafeIpSignal(requestHeaders?: Headers) {
  if (!requestHeaders) {
    return { ipHash: null, sourceHeader: null, forwardedChainLength: null }
  }

  const forwardedFor = requestHeaders.get('x-forwarded-for')
  const candidates = [
    { header: 'x-forwarded-for', value: forwardedFor?.split(',')[0]?.trim() || null },
    { header: 'cf-connecting-ip', value: requestHeaders.get('cf-connecting-ip') },
    { header: 'x-real-ip', value: requestHeaders.get('x-real-ip') },
  ]
  const match = candidates.find((candidate) => candidate.value)

  if (!match?.value) {
    return { ipHash: null, sourceHeader: null, forwardedChainLength: null }
  }

  const salt = process.env.AGENT_VISIT_HASH_SALT || process.env.NEXT_PUBLIC_SUPABASE_URL || 'nexez-agent-visit'
  const ipHash = createHash('sha256').update(`${salt}:${match.value}`).digest('hex')

  return {
    ipHash,
    sourceHeader: match.header,
    forwardedChainLength: forwardedFor ? forwardedFor.split(',').filter(Boolean).length : null,
  }
}
