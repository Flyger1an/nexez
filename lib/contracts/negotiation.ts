import { z } from 'zod'
import { positiveAppMinorAmountSchema } from './money'
import type { OwnerDecisionRequest, OwnerNegotiationDecision } from './negotiation-types'

export {
  OWNER_DECISION_ACTIONS,
  type OwnerDecisionRequest,
  type OwnerNegotiationDecision,
} from './negotiation-types'

const reasoningSchema = z.string().trim().min(1).max(2_000)
const optionalText = z.string().trim().min(1).max(1_000).optional()

const acceptDecisionSchema = z.object({
  action: z.literal('accept'),
  reasoning: reasoningSchema,
  amountCents: positiveAppMinorAmountSchema.min(50).optional(),
  internalNotes: optionalText,
}).strict()

const counterDecisionSchema = z.object({
  action: z.literal('counter'),
  reasoning: reasoningSchema,
  counter: z.object({
    priceCents: positiveAppMinorAmountSchema.min(50),
    proposedDate: optionalText,
    scopeNotes: optionalText,
  }).strict(),
  internalNotes: optionalText,
}).strict()

const rejectDecisionSchema = z.object({
  action: z.literal('reject'),
  reasoning: reasoningSchema,
  internalNotes: optionalText,
}).strict()

const clarifyDecisionSchema = z.object({
  action: z.literal('clarify'),
  reasoning: reasoningSchema,
  clarificationQuestions: z.array(z.string().trim().min(1).max(500)).max(10).optional(),
  internalNotes: optionalText,
}).strict()

const pauseDecisionSchema = z.object({
  action: z.literal('pause'),
  reasoning: reasoningSchema,
  internalNotes: optionalText,
}).strict()

const resumeDecisionSchema = z.object({
  action: z.literal('resume'),
  reasoning: reasoningSchema,
  internalNotes: optionalText,
}).strict()

export const ownerNegotiationDecisionSchema = z.discriminatedUnion('action', [
  acceptDecisionSchema,
  counterDecisionSchema,
  rejectDecisionSchema,
  clarifyDecisionSchema,
  pauseDecisionSchema,
  resumeDecisionSchema,
]) satisfies z.ZodType<OwnerNegotiationDecision>

export const ownerDecisionRequestSchema = z.object({
  negotiationId: z.string().trim().min(1).max(100),
  decision: ownerNegotiationDecisionSchema,
}).strict() satisfies z.ZodType<OwnerDecisionRequest>
