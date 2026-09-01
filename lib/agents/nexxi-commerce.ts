import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  NexxiCommerceCapabilitySchema,
  type NexxiCommerceCapability,
  type NexxiCommerceRail,
} from '../../contracts/nexxi/v1'
import {
  type AgentPage,
  PUBLIC_PAGE_SELECT,
  getCheckoutOffer,
  getPreferredOriginalOfferUrl,
  isOfferActionAvailable,
} from '../agent-page'
import { buildAgentOfferConfiguration } from '../agent-offer-configuration'
import type { AgentSearchResult } from '../agent-search'
import { parseMarketplacePriceCents } from '../marketplace'
import { isPublicLaunchVisiblePage } from '../public-page-visibility'
import { resolvePublicCommerceCapabilities } from '../server/public-commerce-capabilities'

const APPROVAL_COMMERCE_KEY = '__nexxiCommerce'

function capability(
  state: NexxiCommerceCapability['state'],
  rail: NexxiCommerceRail,
  reasonCode: NexxiCommerceCapability['reasonCode'],
  message: string,
): NexxiCommerceCapability {
  return { state, rail, reasonCode, message }
}

function preparedRail(rail: Extract<NexxiCommerceRail, 'configured' | 'recurring' | 'staged' | 'reservable'>): NexxiCommerceCapability {
  const label = rail === 'recurring'
    ? 'recurring agreement'
    : rail === 'staged'
      ? 'first staged-payment obligation'
      : rail === 'reservable'
        ? 'resource hold'
        : 'configured checkout'
  return capability(
    'actionable',
    rail,
    'supported',
    `Nexxi can dry-run and bind the exact ${label} before buyer approval.`,
  )
}

export function commerceCapabilityForSearchResult(result: AgentSearchResult): NexxiCommerceCapability {
  if (result.source && result.source.id !== 'nexez') {
    return capability('view_only', 'external', 'external_source', 'This result is available for discovery only.')
  }
  if (!result.offer) {
    return capability('unavailable', 'unknown', 'not_available', 'This listing does not expose an actionable offer.')
  }
  const action = result.offer.action
  if (!action) {
    if (result.offer.checkout_url && result.offer.provider_url) {
      return capability('view_only', 'provider', 'provider_handoff', 'Continue on the provider site to view this offer.')
    }
    return capability('unavailable', 'unknown', 'not_available', 'This offer is not available for checkout right now.')
  }
  if (action.rail === 'negotiation') {
    return capability('actionable', 'negotiation', 'supported', 'Nexxi can prepare this negotiation for your approval.')
  }
  if (action.rail === 'one_time') {
    return capability('actionable', 'one_time', 'supported', 'Nexxi can prepare this checkout handoff for your approval.')
  }
  if (action.rail === 'configured' || action.rail === 'recurring' || action.rail === 'staged' || action.rail === 'reservable') {
    return preparedRail(action.rail)
  }
  return capability('unavailable', 'unknown', 'invalid_contract', 'This offer does not expose a supported Nexxi checkout rail.')
}

function railForPageOffer(page: AgentPage, offerKey: string): {
  capability: NexxiCommerceCapability
  offerFound: boolean
} {
  const offer = getCheckoutOffer(page, offerKey)
  if (!offer || !isOfferActionAvailable(offer)) {
    return {
      offerFound: Boolean(offer),
      capability: capability('unavailable', 'unknown', 'not_available', 'This offer is not available for checkout right now.'),
    }
  }
  if (getPreferredOriginalOfferUrl(page, offer)) {
    return {
      offerFound: true,
      capability: capability('view_only', 'provider', 'provider_handoff', 'Continue on the provider site to view this offer.'),
    }
  }
  if (offer.offerType === 'negotiable') {
    return {
      offerFound: true,
      capability: capability('unavailable', 'negotiation', 'not_available', 'Use the negotiation action for this offer.'),
    }
  }

  const configuration = buildAgentOfferConfiguration(offer)
  const checkoutPath = configuration?.checkout.path ?? '/api/checkout'
  if (checkoutPath === '/api/service-agreements/checkout') {
    return { offerFound: true, capability: preparedRail('recurring') }
  }
  if (checkoutPath === '/api/staged-settlements/checkout') {
    return { offerFound: true, capability: preparedRail('staged') }
  }
  if (checkoutPath === '/api/reservable-resources/checkout') {
    return { offerFound: true, capability: preparedRail('reservable') }
  }
  if (configuration?.input_schema) {
    return { offerFound: true, capability: preparedRail('configured') }
  }
  if ((parseMarketplacePriceCents(offer.price) ?? 0) <= 0) {
    return {
      offerFound: true,
      capability: capability('unavailable', 'one_time', 'not_available', 'This offer does not have a payable price.'),
    }
  }
  return {
    offerFound: true,
    capability: capability('actionable', 'one_time', 'supported', 'Nexxi can prepare this checkout handoff for your approval.'),
  }
}

/** Resolve the offer again at each approval boundary. Client and model payloads are never authority. */
export async function resolveNexxiBookingCapability(
  db: SupabaseClient,
  payload: Record<string, unknown>,
): Promise<NexxiCommerceCapability> {
  const slug = typeof payload.slug === 'string' ? payload.slug.trim() : ''
  const offerKey = typeof payload.offer === 'string' ? payload.offer.trim() : ''
  if (!slug || !offerKey) {
    return capability('unavailable', 'unknown', 'invalid_contract', 'A valid listing and offer are required.')
  }

  const { data: page, error } = await db
    .from('pages_public')
    .select(PUBLIC_PAGE_SELECT)
    .eq('slug', slug)
    .eq('is_published', true)
    .maybeSingle<AgentPage>()
  if (error || !page || !isPublicLaunchVisiblePage(page)) {
    return capability('unavailable', 'unknown', 'not_available', 'This offer is not available in Nexxi.')
  }

  const resolved = railForPageOffer(page, offerKey)
  if (!resolved.offerFound || resolved.capability.state !== 'actionable') return resolved.capability

  const readiness = await resolvePublicCommerceCapabilities([slug])
  if (!readiness.checkoutReadySlugs.has(slug)) {
    return capability('unavailable', resolved.capability.rail, 'not_available', 'Checkout is not ready for this seller right now.')
  }
  return resolved.capability
}

export function attachApprovalCommerce(
  payload: Record<string, unknown>,
  commerce: NexxiCommerceCapability,
): Record<string, unknown> {
  return { ...payload, [APPROVAL_COMMERCE_KEY]: commerce }
}

export function approvalCommerce(payload: Record<string, unknown>): NexxiCommerceCapability | null {
  const parsed = NexxiCommerceCapabilitySchema.safeParse(payload[APPROVAL_COMMERCE_KEY])
  return parsed.success ? parsed.data : null
}
