import { z } from 'zod'

export const NEXXI_LAUNCH_EVENT_NAMES = [
  'app_opened',
  'onboarding_completed',
  'agent_turn_completed',
  'checkout_started',
  'checkout_returned',
  'feedback_opened',
] as const

const nullableShortText = (max: number) =>
  z.string().trim().max(max).nullish().transform((value) => value || null)

export const NexxiLaunchEventSchema = z
  .object({
    clientEventId: z.string().uuid(),
    eventName: z.enum(NEXXI_LAUNCH_EVENT_NAMES),
    outcome: z.enum(['success', 'cancelled', 'interrupted']).nullish().transform((value) => value ?? null),
    platform: z.enum(['ios', 'android', 'web', 'unknown']),
    appVersion: nullableShortText(40),
    buildVersion: nullableShortText(40),
    runtimeVersion: nullableShortText(80),
    updateId: nullableShortText(80),
    channel: nullableShortText(40),
  })
  .strict()
  .superRefine((event, context) => {
    const hasCheckoutOutcome = event.eventName === 'checkout_returned'
    if (hasCheckoutOutcome !== Boolean(event.outcome)) {
      context.addIssue({
        code: 'custom',
        path: ['outcome'],
        message: 'Outcome is required only for checkout_returned.',
      })
    }
  })

export type NexxiLaunchEvent = z.infer<typeof NexxiLaunchEventSchema>
