import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import {
  NexxiCommerceRailSchema,
  type NexxiCommerceRail,
} from '../../contracts/nexxi/v1'
import {
  type AgentPage,
  PUBLIC_PAGE_SELECT,
  getCheckoutOffer,
  getPreferredOriginalOfferUrl,
  isOfferActionAvailable,
} from '../agent-page'
import {
  buildOfferConfigurationInputSchema,
  getOfferCheckoutPath,
  type OfferCheckoutPath,
} from '../agent-offer-configuration'
import {
  executePreparedApprovalBoundAction,
  prepareApprovalBoundAction,
  type ApprovalActionResponse,
  type PreparedApprovalBoundAction,
} from '../approval-bound-action'
import { parseMarketplacePriceCents } from '../marketplace'
import { isPublicLaunchVisiblePage } from '../public-page-visibility'

const INTERNAL_PREPARED_ACTION_KEY = '__nexxiPreparedAction'
export const PUBLIC_COMMERCE_ACTION_KEY = 'commerceAction'

const EndpointPathSchema = z.enum([
  '/api/checkout',
  '/api/service-agreements/checkout',
  '/api/staged-settlements/checkout',
  '/api/reservable-resources/checkout',
])

const PreparedBookingSchema = z.object({
  schemaVersion: z.literal(1),
  rail: NexxiCommerceRailSchema,
  endpointPath: EndpointPathSchema,
  input: z.record(z.string(), z.unknown()),
  validation: z.record(z.string(), z.unknown()),
  approvalToken: z.string().min(1).nullable(),
  idempotencyKey: z.string().min(16).max(255),
}).strict()

type PreparedBooking = z.infer<typeof PreparedBookingSchema>

export type NexxiCommerceActionDescriptor = {
  schemaVersion: 1
  rail: NexxiCommerceRail
  endpointFamily: OfferCheckoutPath
  inputSchema: Record<string, unknown> | null
  idempotency: {
    required: boolean
    boundToApproval: true
  }
  dryRun: Record<string, unknown> & {
    required: true
    completed: true
  }
}

type ResolvedAction = {
  rail: Exclude<NexxiCommerceRail, 'provider' | 'negotiation' | 'external' | 'unknown'>
  endpointPath: OfferCheckoutPath
  inputSchema: Record<string, unknown> | null
  idempotencyRequired: boolean
}

type Buyer = { email: string | null; userId: string }

export class NexxiCommercePreparationError extends Error {
  readonly code: string
  readonly buyerInputPrompts: string[]

  constructor(message: string, code: string, buyerInputPrompts: string[] = []) {
    super(message)
    this.name = 'NexxiCommercePreparationError'
    this.code = code
    this.buyerInputPrompts = buyerInputPrompts
  }
}

/** Resolve a canonical route from current published offer data, never caller URLs. */
export async function resolveNexxiCommerceAction(
  db: SupabaseClient,
  payload: Record<string, unknown>,
): Promise<ResolvedAction> {
  const slug = stringValue(payload.slug)
  const offerKey = stringValue(payload.offer)
  if (!slug || !offerKey) {
    throw new NexxiCommercePreparationError('A valid listing and offer are required.', 'invalid_contract')
  }

  const { data: page, error } = await db
    .from('pages_public')
    .select(PUBLIC_PAGE_SELECT)
    .eq('slug', slug)
    .eq('is_published', true)
    .maybeSingle<AgentPage>()
  if (error || !page || !isPublicLaunchVisiblePage(page)) {
    throw new NexxiCommercePreparationError('This offer is not available in Nexxi.', 'not_available')
  }

  const offer = getCheckoutOffer(page, offerKey)
  if (!offer || !isOfferActionAvailable(offer)) {
    throw new NexxiCommercePreparationError('This offer is not available for checkout right now.', 'not_available')
  }
  if (getPreferredOriginalOfferUrl(page, offer)) {
    throw new NexxiCommercePreparationError('This offer must be completed on the provider site.', 'provider_handoff')
  }
  if (offer.offerType === 'negotiable') {
    throw new NexxiCommercePreparationError('Use the negotiation action for this offer.', 'negotiation_required')
  }
  if ((parseMarketplacePriceCents(offer.price) ?? 0) <= 0) {
    throw new NexxiCommercePreparationError('This offer does not have a payable price.', 'not_available')
  }

  const endpointPath = getOfferCheckoutPath(offer)
  const inputSchema = buildOfferConfigurationInputSchema(offer)
  const hasInputs = Object.keys((inputSchema.properties as Record<string, unknown> | undefined) ?? {}).length > 0
  const rail = railForPath(endpointPath, hasInputs)
  return {
    rail,
    endpointPath,
    inputSchema: hasInputs ? inputSchema : null,
    idempotencyRequired: endpointPath === '/api/staged-settlements/checkout'
      || endpointPath === '/api/reservable-resources/checkout',
  }
}

/** Dry-run the exact authoritative rail before an approval row is shown. */
export async function prepareNexxiBookingAction(
  db: SupabaseClient,
  payload: Record<string, unknown>,
  buyer: Buyer,
  options: { baseUrl: string; fetchImpl?: typeof fetch },
): Promise<{
  storedPayload: Record<string, unknown>
  descriptor: NexxiCommerceActionDescriptor
}> {
  const resolved = await resolveNexxiCommerceAction(db, payload)
  const missingInputs = missingRequiredBuyerInputs(resolved.inputSchema, payload.offerConfiguration)
  if (missingInputs.length) {
    throw new NexxiCommercePreparationError(
      `Ask the buyer before preparing checkout: ${missingInputs.join(' ')}`,
      'buyer_inputs_required',
      missingInputs,
    )
  }
  const actionInput: Record<string, unknown> = {
    slug: stringValue(payload.slug),
    offer: stringValue(payload.offer),
    query: stringValue(payload.query) || 'Buyer booking via Nexxi',
    ...(isRecord(payload.offerConfiguration) ? { offerConfiguration: payload.offerConfiguration } : {}),
    ...(buyer.email ? { buyerEmail: buyer.email } : {}),
    buyerReference: buyer.userId,
    buyerAgent: 'Nexxi',
  }
  const prepared = await prepareApprovalBoundAction({
    url: `${options.baseUrl.replace(/\/$/, '')}${resolved.endpointPath}`,
    input: actionInput,
    fetchImpl: options.fetchImpl,
    idempotencyKey: createBookingIdempotencyKey(),
    headers: { 'user-agent': 'Nexxi-Mobile-Agent/1.0' },
  })

  const validation = withoutApprovalToken(prepared.validation)
  const internal: PreparedBooking = {
    schemaVersion: 1,
    rail: resolved.rail,
    endpointPath: resolved.endpointPath,
    input: prepared.input,
    validation,
    approvalToken: prepared.approvalToken,
    idempotencyKey: prepared.idempotencyKey,
  }
  const descriptor: NexxiCommerceActionDescriptor = {
    schemaVersion: 1,
    rail: resolved.rail,
    endpointFamily: resolved.endpointPath,
    inputSchema: resolved.inputSchema,
    idempotency: {
      required: resolved.idempotencyRequired,
      boundToApproval: true,
    },
    dryRun: {
      required: true,
      completed: true,
      ...publicDryRun(validation),
    },
  }

  return {
    storedPayload: {
      slug: actionInput.slug,
      offer: actionInput.offer,
      query: actionInput.query,
      ...(actionInput.offerConfiguration ? { offerConfiguration: actionInput.offerConfiguration } : {}),
      ...(payload.__nexxiCommerce ? { __nexxiCommerce: payload.__nexxiCommerce } : {}),
      [PUBLIC_COMMERCE_ACTION_KEY]: descriptor,
      [INTERNAL_PREPARED_ACTION_KEY]: internal,
    },
    descriptor,
  }
}

/** Re-resolve route identity before claiming an approval. The live route then
 * verifies its payload-bound token against current price, terms, and state. */
export async function validatePreparedNexxiBookingAction(
  db: SupabaseClient,
  payload: Record<string, unknown>,
): Promise<PreparedBooking> {
  const prepared = parsePrepared(payload)
  const current = await resolveNexxiCommerceAction(db, prepared.input)
  if (current.rail !== prepared.rail || current.endpointPath !== prepared.endpointPath) {
    throw new NexxiCommercePreparationError(
      'This offer changed after it was prepared. Refresh it before approving.',
      'stale_action',
    )
  }
  return prepared
}

export async function executePreparedNexxiBookingAction(
  payload: Record<string, unknown>,
  options: { baseUrl: string; fetchImpl?: typeof fetch },
) {
  const stored = parsePrepared(payload)
  const prepared: PreparedApprovalBoundAction = {
    url: `${options.baseUrl.replace(/\/$/, '')}${stored.endpointPath}`,
    input: stored.input,
    validation: stored.validation as ApprovalActionResponse,
    approvalToken: stored.approvalToken,
    idempotencyKey: stored.idempotencyKey,
    headers: { 'user-agent': 'Nexxi-Mobile-Agent/1.0' },
  }
  return executePreparedApprovalBoundAction(prepared, { fetchImpl: options.fetchImpl })
}

export function hasPreparedNexxiBookingAction(payload: Record<string, unknown>): boolean {
  return PreparedBookingSchema.safeParse(payload[INTERNAL_PREPARED_ACTION_KEY]).success
}

/** Never send the approval token or internal replay tuple to the mobile client. */
export function publicApprovalPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const { [INTERNAL_PREPARED_ACTION_KEY]: _internal, ...publicPayload } = payload
  return publicPayload
}

function parsePrepared(payload: Record<string, unknown>): PreparedBooking {
  const parsed = PreparedBookingSchema.safeParse(payload[INTERNAL_PREPARED_ACTION_KEY])
  if (!parsed.success) {
    throw new NexxiCommercePreparationError(
      'This approval does not contain a valid prepared commerce action.',
      'invalid_prepared_action',
    )
  }
  return parsed.data
}

function railForPath(endpointPath: OfferCheckoutPath, hasInputs: boolean): ResolvedAction['rail'] {
  if (endpointPath === '/api/service-agreements/checkout') return 'recurring'
  if (endpointPath === '/api/staged-settlements/checkout') return 'staged'
  if (endpointPath === '/api/reservable-resources/checkout') return 'reservable'
  return hasInputs ? 'configured' : 'one_time'
}

function publicDryRun(validation: Record<string, unknown>): Record<string, unknown> {
  const keys = [
    'provider',
    'amountCents',
    'currency',
    'agreedTotalCents',
    'connectReady',
    'stripeConfigured',
    'offerConfiguration',
    'requiredOfferConfigurationFields',
    'offerPricing',
    'offerFulfillment',
    'recurringAgreement',
    'recurringAgreementFingerprint',
    'stagedSettlementAgreement',
    'stagedSettlementContractFingerprint',
    'currentObligation',
    'resources',
  ]
  return Object.fromEntries(keys.flatMap((key) => key in validation ? [[key, validation[key]]] : []))
}

function withoutApprovalToken(validation: ApprovalActionResponse): Record<string, unknown> {
  const { approvalToken: _approvalToken, ...safe } = validation
  return safe
}

function createBookingIdempotencyKey() {
  const nonce = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  return `nexxi:booking:${nonce}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function missingRequiredBuyerInputs(inputSchema: Record<string, unknown> | null, configuration: unknown): string[] {
  if (!inputSchema || !Array.isArray(inputSchema.required)) return []
  const values = isRecord(configuration) ? configuration : {}
  const properties = isRecord(inputSchema.properties) ? inputSchema.properties : {}
  return inputSchema.required.flatMap((rawKey) => {
    if (typeof rawKey !== 'string' || hasBuyerValue(values[rawKey])) return []
    const property = isRecord(properties[rawKey]) ? properties[rawKey] : {}
    const label = stringValue(property.title) || rawKey.replace(/[_-]+/g, ' ')
    const prompt = stringValue(property['x-nexez-ask-buyer']) || `What should ${label} be?`
    return [`${label}: ${prompt}`]
  })
}

function hasBuyerValue(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  return value !== undefined && value !== null
}
