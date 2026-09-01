import { z } from 'zod'

/**
 * Canonical wire contract for Nexez's Nexxi buyer-agent clients.
 *
 * Nexez owns this source. Client repositories consume a generated snapshot and
 * must preserve the fail-closed legacy normalization in this file.
 */
export const NEXXI_CONTRACT_VERSION = 1 as const

export const NexxiModeSchema = z.enum(['text', 'voice'])
export const NexxiApprovalDecisionSchema = z.enum(['approved', 'rejected'])

export const NexxiCommerceRailSchema = z.enum([
  'one_time',
  'configured',
  'recurring',
  'staged',
  'reservable',
  'provider',
  'negotiation',
  'external',
  'unknown',
])

export const NexxiCommerceCapabilitySchema = z.object({
  state: z.enum(['actionable', 'view_only', 'unavailable']),
  rail: NexxiCommerceRailSchema,
  reasonCode: z.enum([
    'supported',
    'requires_configuration',
    'unsupported_rail',
    'provider_handoff',
    'external_source',
    'not_available',
    'legacy_contract',
    'invalid_contract',
  ]),
  message: z.string().min(1).max(240),
}).strict()

const SourceSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
}).strict()

const PageResultFields = {
  type: z.literal('page_result'),
  id: z.string().min(1),
  title: z.string(),
  subtitle: z.string(),
  description: z.string().nullable(),
  price: z.string().nullable(),
  slug: z.string(),
  url: z.string(),
  agentJsonUrl: z.string(),
  offerKey: z.string().nullable(),
  offerName: z.string().nullable(),
  checkoutUrl: z.string().nullable(),
  score: z.number().finite(),
  source: SourceSchema.optional(),
}

const ApprovalFields = {
  type: z.literal('approval'),
  id: z.string().min(1),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'EXECUTED', 'FAILED']),
  toolName: z.enum(['initiate_negotiation', 'trigger_booking']),
  title: z.string(),
  summary: z.string(),
  payload: z.record(z.string(), z.unknown()),
}

export const NexxiPageResultCardSchema = z.object({
  ...PageResultFields,
  commerce: NexxiCommerceCapabilitySchema,
}).strict()

export const NexxiApprovalCardSchema = z.object({
  ...ApprovalFields,
  commerce: NexxiCommerceCapabilitySchema,
}).strict()

export const NexxiActionResultCardSchema = z.object({
  type: z.literal('action_result'),
  id: z.string().min(1),
  title: z.string(),
  status: z.enum(['success', 'error']),
  description: z.string(),
  url: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).strict()

export const NexxiCardSchema = z.discriminatedUnion('type', [
  NexxiPageResultCardSchema,
  NexxiApprovalCardSchema,
  NexxiActionResultCardSchema,
])

export const NexxiTurnPayloadSchema = z.object({
  threadId: z.string().min(1),
  agentId: z.string().min(1),
  message: z.string(),
  cards: z.array(NexxiCardSchema),
  suggestions: z.array(z.string()),
  toolsUsed: z.array(z.string()),
  memory: z.record(z.string(), z.unknown()),
  model: z.object({
    configured: z.boolean(),
    provider: z.string(),
    name: z.string(),
  }).strict(),
}).strict()

export const NexxiTurnResponseSchema = NexxiTurnPayloadSchema.extend({
  ok: z.literal(true),
  contractVersion: z.literal(NEXXI_CONTRACT_VERSION),
})

const LegacyPageResultCardSchema = z.object(PageResultFields).strict()
const LegacyApprovalCardSchema = z.object(ApprovalFields).strict()
const LegacyCardSchema = z.discriminatedUnion('type', [
  LegacyPageResultCardSchema,
  LegacyApprovalCardSchema,
  NexxiActionResultCardSchema,
])

const LegacyTurnResponseSchema = z.object({
  ok: z.literal(true).optional(),
  threadId: z.string().min(1),
  agentId: z.string().min(1),
  message: z.string(),
  cards: z.array(LegacyCardSchema),
  suggestions: z.array(z.string()),
  toolsUsed: z.array(z.string()),
  memory: z.record(z.string(), z.unknown()),
  model: z.object({
    configured: z.boolean(),
    provider: z.string(),
    name: z.string(),
  }).strict(),
}).strict()

export type NexxiMode = z.infer<typeof NexxiModeSchema>
export type NexxiApprovalDecision = z.infer<typeof NexxiApprovalDecisionSchema>
export type NexxiCommerceRail = z.infer<typeof NexxiCommerceRailSchema>
export type NexxiCommerceCapability = z.infer<typeof NexxiCommerceCapabilitySchema>
export type NexxiCard = z.infer<typeof NexxiCardSchema>
export type NexxiTurnPayload = z.infer<typeof NexxiTurnPayloadSchema>
export type NexxiTurnResponse = z.infer<typeof NexxiTurnResponseSchema>

function legacyCommerce(
  card: z.infer<typeof LegacyPageResultCardSchema> | z.infer<typeof LegacyApprovalCardSchema>,
): NexxiCommerceCapability {
  if (card.type === 'approval' && card.toolName === 'initiate_negotiation') {
    return {
      state: 'actionable',
      rail: 'negotiation',
      reasonCode: 'supported',
      message: 'This negotiation uses the established buyer-approval flow.',
    }
  }
  if (card.type === 'page_result' && card.source && card.source.id !== 'nexez') {
    return {
      state: 'view_only',
      rail: 'external',
      reasonCode: 'external_source',
      message: 'This result is available for discovery only.',
    }
  }
  return {
    state: 'view_only',
    rail: 'unknown',
    reasonCode: 'legacy_contract',
    message: 'Refresh this result before taking a commerce action.',
  }
}

function normalizeLegacyCard(card: z.infer<typeof LegacyCardSchema>): NexxiCard {
  if (card.type === 'action_result') return card
  return { ...card, commerce: legacyCommerce(card) }
}

/** Parse a current turn response, accepting old responses only in fail-closed form. */
export function parseNexxiTurnResponse(input: unknown): NexxiTurnResponse {
  const current = NexxiTurnResponseSchema.safeParse(input)
  if (current.success) return current.data

  const legacy = LegacyTurnResponseSchema.safeParse(input)
  if (!legacy.success) throw current.error
  return {
    ...legacy.data,
    ok: true,
    contractVersion: NEXXI_CONTRACT_VERSION,
    cards: legacy.data.cards.map(normalizeLegacyCard),
  }
}

/** Restore persisted cards while dropping malformed or unknown card variants. */
export function parseNexxiCards(input: unknown): NexxiCard[] {
  if (!Array.isArray(input)) return []
  return input.flatMap((candidate) => {
    const current = NexxiCardSchema.safeParse(candidate)
    if (current.success) return [current.data]
    const legacy = LegacyCardSchema.safeParse(candidate)
    return legacy.success ? [normalizeLegacyCard(legacy.data)] : []
  })
}
